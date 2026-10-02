"""Enrich an extracted article with Crossref metadata (authors/affiliations/ORCID, volume, licence, citations, structured references)."""
import json
import re
import urllib.parse
import urllib.request

from django.conf import settings


def fetch(doi, timeout=12):
    """Return the Crossref 'message' dict or None (offline, unknown DOI...)."""
    if not doi:
        return None
    url = "https://api.crossref.org/works/" + urllib.parse.quote(doi, safe="/")
    req = urllib.request.Request(url, headers={"User-Agent": f"SiaNexis-CMS/1.0 (mailto:{getattr(settings, 'CONTACT_EMAIL', 'info@example.com')})"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)["message"]
    except Exception:
        return None


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _license(url):
    m = re.search(r"creativecommons\.org/licenses/(by(?:-[a-z]+)*)/(\d\.\d)", url or "")
    return (f"CC {m.group(1).upper()} {m.group(2)}", f"https://creativecommons.org/licenses/{m.group(1)}/{m.group(2)}/") if m else (None, None)


def _date(cr):
    for key in ("published", "published-online", "published-print", "issued"):
        parts = (cr.get(key) or {}).get("date-parts") or [[None]]
        p = parts[0]
        if p and p[0]:
            return f"{p[0]:04d}-{(p[1] if len(p) > 1 else 1):02d}-{(p[2] if len(p) > 2 else 1):02d}", p[0]
    return None, None


def apply(data, cr):
    """Merge Crossref into data (PDF values win for text, Crossref wins for bibliographic facts). Returns list of change notes."""
    notes = []
    if not cr:
        return notes
    if cr.get("title") and not data.get("title"):
        data["title"] = cr["title"][0]
    for key, val in (("journal", (cr.get("container-title") or [None])[0]), ("volume", cr.get("volume")), ("issue", cr.get("issue")),
                     ("article_number", cr.get("article-number") or cr.get("page")), ("publisher", cr.get("publisher")),
                     ("issn", (cr.get("ISSN") or [None])[0])):
        if val:
            data[key] = val
    pdate, year = _date(cr)
    if pdate:
        data["published_date"], data["year"] = pdate, year
    lic = next((l.get("URL") for l in cr.get("license", []) if "creativecommons" in l.get("URL", "")), None)
    name, lurl = _license(lic)
    if name:
        data["license"], data["license_url"], data["open_access"] = name, lurl, True
    if cr.get("is-referenced-by-count") is not None:
        data["citations"] = cr["is-referenced-by-count"]
    if cr.get("subject") and not data.get("subjects"):
        data["subjects"] = ", ".join(cr["subject"])
    if cr.get("abstract") and not (data.get("abstract") or data.get("abstract_background")):
        data["abstract"] = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", cr["abstract"])).strip()

    # authors: Crossref has clean names, affiliations and ORCID; keep corresponding/email found in the PDF
    old = {_norm(a["name"].split()[-1]): a for a in data.get("authors_detail", [])}
    authors = []
    for a in cr.get("author", []):
        fam, giv = a.get("family", ""), a.get("given", "")
        if not fam:
            continue
        prev = old.get(_norm(fam), {})
        aff = "; ".join(x.get("name", "") for x in a.get("affiliation", []) if x.get("name")) or prev.get("affiliation", "")
        orcid = re.sub(r"^https?://orcid\.org/", "", a.get("ORCID", ""))
        authors.append({"name": f"{giv} {fam}".strip(), "given_name": giv, "family_name": fam, "affiliation": aff,
                        "corresponding": prev.get("corresponding", False), "email": prev.get("email", ""), "orcid": orcid})
    if authors and len(authors) >= len(data.get("authors_detail", [])):
        data["authors_detail"] = authors
        data["authors"] = ", ".join(a["name"] for a in authors)
        notes.append("authors")

    refs, crefs = data.get("references", []), cr.get("reference", [])
    if refs and crefs:
        if len(refs) == len(crefs):
            pairs = list(zip(refs, crefs))
        else:
            pairs = []
            for r in refs:
                n = _norm(r["text"])
                match = next((c for c in crefs if c.get("article-title") and _norm(c["article-title"]) in n), None)
                if match:
                    pairs.append((r, match))
        filled = 0
        for r, c in pairs:
            if c.get("DOI") and not r.get("doi"):
                r["doi"] = c["DOI"]
                filled += 1
            if not r.get("title") and c.get("article-title"):
                r["title"] = c["article-title"]
                r["authors"] = r.get("authors") or c.get("author", "")
                r["source"] = r.get("source") or " ".join(x for x in (c.get("journal-title"), str(c.get("year", "")), c.get("volume", "")) if x)
        if filled:
            notes.append(f"refs:{filled}")
    return notes
