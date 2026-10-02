"""Parse publication lists exported from Google Scholar (BibTeX / CSV) or any BibTeX file."""
import csv
import io
import re

KIND_BY_BIBTYPE = {"unpublished": "manuscript", "misc": "output", "techreport": "output", "online": "output"}


def _clean(value):
    value = re.sub(r"\s+", " ", (value or "").replace("\n", " ")).strip()
    return value.replace("{", "").replace("}", "").replace("\\&", "&").replace("\\_", "_").strip()


def _authors(raw):
    """'Last, First and Last2, First2' -> 'First Last, First2 Last2' (leaves other styles untouched)."""
    people = [p.strip() for p in re.split(r"\s+and\s+", _clean(raw)) if p.strip() and p.strip().lower() != "others"]
    out = []
    for p in people:
        if "," in p:
            last, first = [x.strip() for x in p.split(",", 1)]
            p = f"{first} {last}".strip()
        out.append(p)
    return ", ".join(out) + (" et al." if re.search(r"\band others\b", raw or "", re.I) else "")


def _doi(raw):
    raw = _clean(raw)
    return re.sub(r"^(https?://)?(dx\.)?doi\.org/", "", raw, flags=re.I)


def _read_braced(text, i):
    """text[i] is '{' or '"'; return (value, next_index)."""
    if text[i] == '"':
        j = text.index('"', i + 1)
        return text[i + 1:j], j + 1
    depth, j = 0, i
    while j < len(text):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i + 1:j], j + 1
        j += 1
    return text[i + 1:], len(text)


def parse_bibtex(text):
    items = []
    for m in re.finditer(r"@(\w+)\s*\{\s*([^,\s]*)\s*,", text):
        btype, i, fields = m.group(1).lower(), m.end(), {}
        if btype in ("comment", "string", "preamble"):
            continue
        while i < len(text):
            fm = re.compile(r"\s*([A-Za-z_\-]+)\s*=\s*").match(text, i)
            if not fm:
                break
            i = fm.end()
            if i < len(text) and text[i] in '{"':
                value, i = _read_braced(text, i)
            else:
                nm = re.compile(r"[^,}\s]+").match(text, i)
                value, i = (nm.group(0), nm.end()) if nm else ("", i)
            fields[fm.group(1).lower()] = value
            cm = re.compile(r"\s*,").match(text, i)
            if cm:
                i = cm.end()
            if re.compile(r"\s*\}").match(text, i):
                break
        title = _clean(fields.get("title"))
        if not title:
            continue
        year = re.search(r"\d{4}", fields.get("year", ""))
        items.append({
            "title": title, "authors": _authors(fields.get("author")),
            "journal": _clean(fields.get("journal") or fields.get("booktitle") or fields.get("publisher")),
            "year": int(year.group(0)) if year else None, "doi": _doi(fields.get("doi")),
            "link": _clean(fields.get("url")), "kind": KIND_BY_BIBTYPE.get(btype, "paper"),
        })
    return items


def parse_csv(text):
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    items = []
    for row in reader:
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
        title = r.get("title")
        if not title:
            continue
        year = re.search(r"\d{4}", r.get("year", ""))
        items.append({
            "title": title, "authors": r.get("authors") or r.get("author", ""),
            "journal": r.get("publication") or r.get("journal") or r.get("source") or r.get("publisher", ""),
            "year": int(year.group(0)) if year else None, "doi": _doi(r.get("doi")),
            "link": r.get("url") or r.get("link", ""), "kind": r.get("kind") if r.get("kind") in ("paper", "manuscript", "output") else "paper",
        })
    return items


def parse_auto(text):
    text = text or ""
    if "@" in text and re.search(r"@\w+\s*\{", text):
        return parse_bibtex(text)
    return parse_csv(text)


def norm_title(t):
    return re.sub(r"[^a-z0-9؀-ۿ]+", "", (t or "").lower())
