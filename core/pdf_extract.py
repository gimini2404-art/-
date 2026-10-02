"""Best-effort extraction of a scientific article from a PDF (text PDFs only, pure Python: pdfminer.six + pypdf).

Works best on standard journal layouts (one or two columns, bold headings, numbered references).
Everything it returns is meant to be reviewed in the CMS as a draft before publishing.
"""
import collections
import io
import re
from dataclasses import dataclass, field

DOI_RE = re.compile(r"\b(10\.\d{4,9}/[^\s\"<>]+?)(?=[\s\"<>]|[.,;:)\]]+(?:\s|$)|$)")
MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}

TOP_LEVEL = [  # (regex on normalised heading, kind)
    (r"^introduction$", "introduction"), (r"^background$", "background"), (r"^(materials and )?methods?$", "methods"),
    (r"^methodology$", "methodology"), (r"^results?( and discussion)?$", "results"), (r"^discussion$", "discussion"),
    (r"^limitations?( and (future|strengths).*)?$", "limitations"), (r"^conclusions?( and .*)?$", "conclusion"),
    (r"^(availability of )?data( and materials?)?( availability)?$", "data_availability"),
    (r"^(declarations?|ethics( declarations?)?)$", "_declarations"), (r"^references?$|^bibliography$", "_references"),
    (r"^abstract$", "_abstract"), (r"^author and article information$|^article information$", "_skip"), (r"^(supplementary (information|material)s?|publisher.?s note|abbreviations?)$", "_skip"),
]
DECLARATION_HEADS = re.compile(r"^(ethics approval.*|consent.*|data availability|competing interests?|conflicts? of interest.*|funding|acknowledg(e)?ments?|"
                               r"author contributions?|authors.? contributions?|availability of data.*|declarations?)$", re.I)
ABSTRACT_LABELS = {"background": "abstract_background", "introduction": "abstract_background", "objective": "abstract_background",
                   "objectives": "abstract_background", "aim": "abstract_background", "aims": "abstract_background", "purpose": "abstract_background",
                   "methods": "abstract_methods", "method": "abstract_methods", "methodology": "abstract_methods", "design": "abstract_methods",
                   "results": "abstract_results", "findings": "abstract_results",
                   "conclusion": "abstract_conclusion", "conclusions": "abstract_conclusion", "interpretation": "abstract_conclusion"}


class PdfProblem(Exception):
    """A PDF that cannot be processed for a known, explainable reason (e.g. 'encrypted')."""


@dataclass
class Line:
    page: int
    x0: float
    x1: float
    top: float
    size: float
    bold: bool
    text: str
    bold_prefix: str = ""
    plain: str = ""          # text without superscript characters
    col: int = 0
    band: int = 0


@dataclass
class Result:
    data: dict = field(default_factory=dict)
    images: list = field(default_factory=list)      # [{"number": 1, "bytes": b"...", "page": 5}]
    warnings: list = field(default_factory=list)


def norm(s):
    return re.sub(r"[^a-z ]", "", re.sub(r"\s+", " ", (s or "").lower())).strip()


# --------------------------------------------------------------------------------------- layout
def read_lines(pdf_bytes):
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LAParams, LTChar, LTTextContainer, LTTextLine

    lines, dims = [], {}
    if b"/Encrypt" in pdf_bytes[-4096:] or b"/Encrypt" in pdf_bytes[:4096]:
        try:
            from pypdf import PdfReader

            if PdfReader(io.BytesIO(pdf_bytes)).is_encrypted:
                raise PdfProblem("encrypted")
        except PdfProblem:
            raise
        except Exception:
            pass
    for pno, page in enumerate(extract_pages(io.BytesIO(pdf_bytes), laparams=LAParams(line_margin=0.3)), 1):
        dims[pno] = (page.width, page.height)
        for el in page:
            if not isinstance(el, LTTextContainer):
                continue
            for ln in el:
                if not isinstance(ln, LTTextLine):
                    continue
                chars = [c for c in ln if isinstance(c, LTChar)]
                text = re.sub(r"\s+", " ", ln.get_text().replace("\n", " ")).strip()
                if not chars or not text:
                    continue
                mx = max(c.size for c in chars)
                if mx < 6.2:
                    continue  # vector-figure labels and other micro text
                bold = lambda c: re.search(r"bold|black|heavy|semibold|demi|[-_ ][789]00$", c.fontname, re.I) is not None
                nb = sum(1 for c in chars if bold(c) and not c.get_text().isspace())
                ns = sum(1 for c in chars if not c.get_text().isspace())
                prefix = ""
                for c in chars:
                    if bold(c) or c.get_text().isspace():
                        prefix += c.get_text()
                    else:
                        break
                plain = re.sub(r"\s+", " ", "".join(c.get_text() for c in chars if c.size >= mx * 0.78)).strip()
                lines.append(Line(pno, ln.x0, ln.x1, page.height - ln.y1, round(mx, 1), ns > 0 and nb / ns > 0.8, text, prefix.strip(), plain))
    return lines, dims


def body_size(lines):
    c = collections.Counter()
    for l in lines:
        c[l.size] += len(l.text)
    return c.most_common(1)[0][0] if c else 10


def drop_running(lines, dims):
    """Remove page headers/footers/page numbers (repeated text near the top/bottom edge)."""
    def key(l):
        return re.sub(r"\d+", "#", norm(l.text) or l.text)

    edge = [l for l in lines if l.top < dims[l.page][1] * 0.075 or l.top > dims[l.page][1] * 0.93]
    count = collections.Counter(key(l) for l in edge)
    npages = max(dims) if dims else 1
    bad = {k for k, v in count.items() if v >= max(2, npages // 3)}
    return [l for l in lines if not (l in edge and (key(l) in bad or re.fullmatch(r"(page )?\d+( of \d+)?", l.text.strip(), re.I)))]


def order_lines(lines, dims, bsize):
    """Reading order: bands of full-width lines, two columns inside a band."""
    out = []
    for pno in sorted(dims):
        w = dims[pno][0]
        pl = sorted([l for l in lines if l.page == pno], key=lambda l: (round(l.top), l.x0))
        mid = w / 2
        left = sum(1 for l in pl if l.x1 < mid + 8)
        right = sum(1 for l in pl if l.x0 > mid - 8)
        two_col = left >= 6 and right >= 6
        if not two_col:
            for l in pl:
                l.col, l.band = 0, 0
            out += pl
            continue
        wide = lambda l: l.x0 < mid - 12 and l.x1 > mid + 12
        band, buf = 0, []
        seq = []
        for l in pl:
            if wide(l):
                if buf:
                    seq.append(("cols", buf))
                    buf = []
                seq.append(("wide", [l]))
            else:
                buf.append(l)
        if buf:
            seq.append(("cols", buf))
        for kind, items in seq:
            if kind == "wide":
                items[0].col = 0
                out.append(items[0])
            else:
                L = sorted([l for l in items if l.x0 < mid - 5], key=lambda l: l.top)
                R = sorted([l for l in items if l.x0 >= mid - 5], key=lambda l: l.top)
                for l in L:
                    l.col = 1
                for l in R:
                    l.col = 2
                out += L + R
    return out


# --------------------------------------------------------------------------------------- helpers
def build_vocab(lines):
    v = collections.Counter()
    for l in lines:
        for w in re.findall(r"[A-Za-z][A-Za-z\-’']*[A-Za-z]", l.text):
            if not l.text.endswith(w + "-"):
                v[w.lower()] += 1
    return v


def join(a, b, vocab):
    if a.endswith("-") and b[:1].islower():
        last = a.split(" ")[-1]
        if re.search(r"[/:]|https?", last):
            return a + b
        stem = re.sub(r"[^A-Za-z’']", "", last)
        first = re.sub(r"[^A-Za-z’']", "", b.split(" ")[0])
        joined, hy = (stem + first).lower(), (stem + "-" + first).lower()
        return a + b if (vocab[hy] > 0 and vocab[joined] == 0) else a[:-1] + b
    return a + " " + b


def parse_date(text):
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text or "")
    if m and m.group(2).lower() in MONTHS:
        return f"{int(m.group(3)):04d}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
    return None


def slug_kind(text):
    n = norm(text)
    for rx, kind in TOP_LEVEL:
        if re.match(rx, n):
            return kind
    return None


# --------------------------------------------------------------------------------------- main
def extract(pdf_bytes):
    res = Result()
    lines, dims = read_lines(pdf_bytes)
    if not lines or sum(len(l.text) for l in lines) < 800:
        res.warnings.append("no_text")  # scanned PDF: no selectable text
        return res
    bsize = body_size(lines)
    lines = drop_running(lines, dims)
    lines = order_lines(lines, dims, bsize)
    vocab = build_vocab(lines)
    d = res.data = {"sections": [], "references": [], "figures": [], "authors_detail": []}

    first = [l for l in lines if l.page == 1]
    front = " ".join(l.text for l in lines if l.page == 1)
    front = re.sub(r"(10\.\d{4,9}/\S*[./-])\s+([a-z0-9]\S*)", r"\1\2", front)
    m = DOI_RE.search(front)
    d["doi"] = m.group(1).rstrip(".,;") if m else ""
    for l in first:
        jm = re.match(r"^([A-Z][A-Za-z&: ]+?)\.?\s+(\d{4});\s*(\d+)(?:\(\d+\))?:(\d+)\s*[–‐-]\s*(\d+)", l.text.strip())
        if jm:
            d.update(journal=jm.group(1).strip(), year=int(jm.group(2)), volume=jm.group(3), article_number=f"{jm.group(4)}–{jm.group(5)}")
            break

    # --- title: largest text on page 1
    big = max((l.size for l in first), default=bsize)
    tl = [l for l in first if l.size >= big - 0.3 and len(l.text) > 3]
    d["title"] = " ".join(l.text for l in tl).strip() if big > bsize + 1.5 else ""
    title_end = max((first.index(l) for l in tl), default=-1)

    # --- journal / volume / article number from running header, e.g. "El Dine et al. BMC Medical Ethics (2024) 25:79"
    for l in lines:
        hm = re.search(r"et al\.?\s+(.+?)\s*\((\d{4})\)\s*(\d+):(\d+)", l.text)
        if hm:
            d.update(journal=hm.group(1).strip(), year=int(hm.group(2)), volume=hm.group(3), article_number=hm.group(4))
            break
    # (running headers are removed from the text but kept in the raw list)
    if "journal" not in d:
        raw, _ = read_lines(pdf_bytes)
        for l in raw[:60]:
            hm = re.search(r"et al\.?\s+(.+?)\s*\((\d{4})\)\s*(\d+):(\d+)", l.text)
            if hm:
                d.update(journal=hm.group(1).strip(), year=int(hm.group(2)), volume=hm.group(3), article_number=hm.group(4))
                break

    # --- abstract + keywords (page 1), authors (between title and abstract)
    abs_i = next((i for i, l in enumerate(first) if re.fullmatch(r"abstract", l.text.strip(), re.I) or norm(l.bold_prefix) == "abstract"), None)
    unheaded = None  # abstract box without an "Abstract" heading (e.g. Wiley): labelled runs "Background: ... Methods: ..."
    lab_rx = re.compile(r"^(Background|Introduction|Aims?|Objectives?|Purpose|Methods?|Methodology|Design|Results|Findings|Conclusions?)\s*:\s", re.I)
    if abs_i is None:
        starts = [l for l in first if l.size < bsize - 0.3 and lab_rx.match(l.text)]
        if len({lab_rx.match(l.text).group(1).lower() for l in starts}) >= 3:
            fs = starts[0]
            box = [l for l in first if abs(l.size - fs.size) < 0.05 and l.top >= fs.top - 1]
            unheaded = (fs, box)
            abs_i = first.index(fs)
    author_lines = []
    if abs_i is not None and title_end >= 0:
        author_lines = [l for l in first[title_end + 1:abs_i] if l.size >= bsize - 0.5 and not re.match(r"(research|review|open access|case|original)", l.text, re.I)]
        author_lines.sort(key=lambda l: (round(l.top / 3), l.x0))
    aff_words = re.compile(r"\b(Department|University|Universit[yé]|Faculty|Institute|Hospital|College|School|Cent(er|re)|Laborator|Ministry|Academy|Clinic)\b|@", re.I)
    author_lines = [l for l in author_lines if not aff_words.search(l.text)]
    raw_digits = re.sub(r"\s+", " ", " ".join(l.text for l in author_lines)).strip()
    people = []
    cred = re.compile(r"^(M\.?\s?D|M\.?\s?Sc|Ph\.?\s?D|M\.?P\.?H|M\.?B\.?B\.?S|B\.?Sc|Pharm\.?D|D\.?D\.?S|R\.?N|M\.?R\.?C\.?P|F\.?R\.?C\.?P|M\.?Phil|MBA|MS|MA|BA|Prof|Dr)\.?$", re.I)
    if not re.search(r"\d", raw_digits) and any(cred.match(x.strip()) for x in raw_digits.split(",")):
        for tok in re.split(r",|\band\b", raw_digits):
            tok = tok.strip(" .")
            if tok and not cred.match(tok) and len(tok.split()) >= 2 and len(tok) < 60:
                people.append((tok, [], False))
    for m2 in ([] if people else re.finditer(r"([A-Z][^,\d*]*?[A-Za-z’'.])\s*(\d{1,2}(?:\s*,\s*\d{1,2})*)?\s*(\*)?\s*(?:,|\band\b|$)", raw_digits)):
        nm = re.sub(r"\s+", " ", m2.group(1)).strip(" ,")
        nm = re.sub(r"^and\s+", "", nm)
        if len(nm.split()) >= 2:
            people.append((nm, [int(x) for x in re.findall(r"\d+", m2.group(2) or "")], bool(m2.group(3))))
    # affiliations: small numbered lines on page 1
    aff = {}
    small1 = [l for l in first if l.size < bsize - 0.5 and not re.search(r"Correspondence|©|Creative Commons|Open Access|permits use|licen[sc]e|^\*", l.text)]
    blocks1 = collections.OrderedDict()
    for l in small1:
        blocks1.setdefault(l.col, []).append(l)
    for col, ls2 in blocks1.items():
        ls2 = sorted(ls2, key=lambda l: l.top)
        rows, row = [], []
        for l in ls2:
            if row and l.top - row[0].top > 2.0:
                rows.append(sorted(row, key=lambda x: x.x0)); row = []
            row.append(l)
        if row:
            rows.append(sorted(row, key=lambda x: x.x0))
        cur_n = None
        for r in rows:
            for l in r:
                t2 = l.text.strip()
                mm = re.fullmatch(r"(\d{1,2})", t2) or re.match(r"^(\d{1,2})\s*([A-Z].*)", t2)
                if mm and (len(r) == 1 or l is r[0]):
                    cur_n = int(mm.group(1))
                    aff[cur_n] = [mm.group(2)] if mm.lastindex == 2 else []
                elif cur_n is not None:
                    aff.setdefault(cur_n, []).append(t2)
    email = re.search(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", " ".join(l.text for l in first))
    names = [n for n, _, _ in people]
    d["authors"] = ", ".join(names)
    for nm, nums, star in people:
        affil = "; ".join(" ".join(aff.get(n, [])).strip() for n in nums if aff.get(n))
        d["authors_detail"].append({"name": nm, "affiliation": re.sub(r"\s+", " ", affil), "corresponding": star,
                                    "email": email.group(0) if star and email else ""})
    if unheaded:
        flat = ""
        for bl in unheaded[1]:
            flat = join(flat, bl.text, vocab) if flat else bl.text
        flat = re.sub(r"\u2010\s+(?=[a-z])", "\u2010", flat)
        labs = list(re.finditer(r"(?:^|(?<=[.!?]\s))(Background|Introduction|Aims?|Objectives?|Purpose|Methods?|Methodology|Design|Results|Findings|Conclusions?)\s*:\s", flat))
        for i2, lm in enumerate(labs):
            end = labs[i2 + 1].start() if i2 + 1 < len(labs) else len(flat)
            key2 = ABSTRACT_LABELS[lm.group(1).lower()]
            d[key2] = (d.get(key2, "") + " " + flat[lm.end():end].strip()).strip()
        kw = next((l for l in first if re.match(r"keywords?\b", l.text, re.I)), None)
        d["keywords"] = re.sub(r"^keywords?\s*[:\-]?\s*", "", kw.text, flags=re.I).strip(", ") if kw else ""
        d["subjects"] = d["keywords"]
        abs_end = 0
        cut_top = max(l.top for l in unheaded[1])
    elif abs_i is not None:
        cur, abstract = None, collections.OrderedDict()
        j = abs_i + 1
        while j < len(first):
            l = first[j]
            if re.match(r"keywords?\b", l.text, re.I):
                d["keywords"] = re.sub(r"^keywords?\s*[:\-]?\s*", "", l.text, flags=re.I).strip()
                k = j + 1
                while k < len(first) and first[k].size <= l.size + 0.2 and first[k].bold is False and not first[k].bold_prefix and len(first[k].text) < 90 and k == j + 1:
                    d["keywords"] += " " + first[k].text
                    k += 1
                break
            lab = norm(l.bold_prefix)
            if lab in ABSTRACT_LABELS and len(l.bold_prefix) < 20:
                cur = ABSTRACT_LABELS[lab]
                abstract[cur] = l.text[len(l.bold_prefix):].strip()
            elif cur:
                abstract[cur] = join(abstract[cur], l.text, vocab)
            else:
                abstract.setdefault("abstract", "")
                abstract["abstract"] = (abstract["abstract"] + " " + l.text).strip()
            j += 1
        d.update(abstract)
        flat = d.get("abstract", "")
        labels = list(re.finditer(r"(?:^|(?<=[.!?]\s))(Background|Introduction|Objectives?|Aims?|Purpose|Methods?|Methodology|Design|Results|Findings|Conclusions?|Interpretation)\s*[:.]\s", flat))
        if flat and len(labels) >= 2 and not d.get("abstract_background"):
            d["abstract"] = ""
            for i2, lm in enumerate(labels):
                end = labels[i2 + 1].start() if i2 + 1 < len(labels) else len(flat)
                key2 = ABSTRACT_LABELS[lm.group(1).lower()]
                d[key2] = (d.get(key2, "") + " " + flat[lm.end():end].strip()).strip()
        d["keywords"] = d.get("keywords", "").strip(", ")
        d["subjects"] = d.get("keywords", "")
        abs_end = j + 1
    else:
        abs_end = 0
        res.warnings.append("no_abstract")

    # --- licence / open access / dates
    blob = " ".join(l.text for l in lines)
    blob = blob.replace("\u2010", "-")
    cc = re.search(r"Creative Commons (Attribution(?:-\w+)*)\s*(?:License\s*)?(\d\.\d)?", blob)
    if cc:
        parts = {"Attribution": "CC BY", "Attribution-NonCommercial": "CC BY-NC", "Attribution-NoDerivs": "CC BY-ND", "Attribution-ShareAlike": "CC BY-SA"}
        ver = cc.group(2) or "4.0"
        d["license"] = f"{parts.get(cc.group(1), 'CC BY')} {ver}"
        d["license_url"] = f"https://creativecommons.org/licenses/by/{ver}/" if d["license"].startswith("CC BY ") else ""
        d["open_access"] = True
        rm = re.search(r"©.{0,40}Open Access This article is licensed.*?(?:otherwise stated in a credit line to the data\.?|credit line to the data\.)", blob)
        if rm:
            d["rights_text"] = rm.group(0)
    rec = re.search(r"Received:?\s*(\d{1,2} \w+ \d{4})", blob)
    acc = re.search(r"Accepted:?\s*(\d{1,2} \w+ \d{4})", blob)
    if not rec:
        rm2 = re.search(r"Received\s+([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})", blob)
        rec = re.match(r"(\d+) (\w+) (\d+)", f"{rm2.group(2)} {rm2.group(1)} {rm2.group(3)}") if rm2 else None
        rec = rec and type("M", (), {"group": lambda self, n, r=rec: r.group(0)})()
    if not acc:
        am2 = re.search(r"accepted\s+([A-Z][a-z]+)\s+(\d{1,2}),?\s*(\d{4})", blob)
        acc = type("M", (), {"group": lambda self, n, t=f"{am2.group(2)} {am2.group(1)} {am2.group(3)}": t})() if am2 else None
    # affiliations given as "Institution (Surname, Surname); ..." (Wiley / APA style)
    if not any(a["affiliation"] for a in d["authors_detail"]):
        am = re.search(r"AUTHOR AND ARTICLE INFORMATION\s*(.*?)(?:Send correspondence|This is an open access|©|Received )", blob.replace("- ", "-") if False else " ".join(l.text for l in lines), re.S)
        if am:
            for im in re.finditer(r"([^()]+?)\s*\(([A-Z][\w’' -]+(?:,\s*[A-Z][\w’' -]+)*)\)", am.group(1)):
                inst = re.sub(r"\s+", " ", re.sub(r"(\w)-\s+(?=[a-z])", r"\1", im.group(1))).strip(" ;,.")
                inst = re.sub(r"^and\s+", "", inst)
                for sn in re.split(r",\s*", im.group(2)):
                    for a in d["authors_detail"]:
                        if a["name"].split()[-1].lower() == sn.strip().lower():
                            a["affiliation"] = (a["affiliation"] + "; " + inst).strip("; ")
    if d["authors_detail"] and not any(a["email"] for a in d["authors_detail"]):
        cm = re.search(r"correspondence to (?:Dr\.|Prof\.|Mr\.|Ms\.)?\s*([A-Z][\w’'-]+)\s*\(([^)]*@[^)]*)\)", " ".join(l.text for l in lines).replace("- ", "-"))
        if cm:
            for a in d["authors_detail"]:
                if a["name"].split()[-1].lower() == cm.group(1).lower():
                    a["corresponding"], a["email"] = True, re.sub(r"\s+", "", cm.group(2))
    d["received_date"] = parse_date(rec.group(1)) if rec else None
    d["accepted_date"] = parse_date(acc.group(1)) if acc else None
    ctype = "research"
    head = " ".join(l.text for l in first[:6]).lower()
    for word, t in (("review", "review"), ("case report", "case_study"), ("case study", "case_study"), ("short report", "short_report"), ("brief report", "short_report")):
        if re.search(rf"^\W*{word}\b", head) or re.search(rf"\b{word}\s+open access", head):
            ctype = t
    d["content_type"] = ctype
    d["abstract_present"] = bool(d.get("abstract") or d.get("abstract_background"))

    # --- body: from the first top-level heading after the abstract
    if unheaded:
        ids = {id(x) for x in unheaded[1]}
        rest = [l for l in lines if (l.page > 1) or (l.top > cut_top and id(l) not in ids)]
    else:
        rest = [l for l in lines if (l.page > 1) or (first.index(l) >= abs_end if l in first else False)]
    heading_lines = []
    sections, cur_kind, buf_par, ref_lines = [], None, [], []
    out_sections = collections.OrderedDict()
    body_lines = []
    in_refs = False
    fig_caps, tab_caps = {}, {}
    skip_small = 0
    i = 0
    while i < len(rest):
        l = rest[i]
        t = l.text.strip()
        # affiliations / correspondence blocks and anything before the first section (page 1) are skipped
        caps = t.isupper() and len(t) < 60
        k = slug_kind(t) if (l.bold or l.bold_prefix == t or l.size > bsize + 0.2 or caps) else None
        if k == "_references":
            in_refs = True
            i += 1
            continue
        if in_refs:
            if re.match(r"publisher.?s note", t, re.I) or (k and k != "_references" and l.size >= bsize - 0.3 and l.bold and k not in ("_skip",)):
                in_refs = False
            else:
                ref_lines.append(l)
                i += 1
                continue
        body_lines.append(l)
        i += 1

    # captions (figures / tables): bold or small "Fig. N" lines
    cap_re = re.compile(r"^(Fig\.?|Figure|Table)\s*(S?\d+)\b[.:]?\s*(.*)", re.I)
    clean = []
    tables = {}
    consumed = set()
    # tables first: every smaller-than-body line below a "Table N" caption on that page belongs to the table
    for l in body_lines:
        m = cap_re.match(l.text.strip())
        if m and m.group(1).lower() == "table" and (l.bold_prefix or l.size < bsize - 0.2) and not m.group(2).startswith("S"):
            tl = [x for x in body_lines if x.page == l.page and x.top > l.top + 3 and x.size < bsize - 0.25 and x is not l and not cap_re.match(x.text.strip())]
            tables[int(m.group(2))] = {"cap_line": l, "lines": tl}
            consumed.update(id(x) for x in tl)
    j = 0
    while j < len(body_lines):
        l = body_lines[j]
        if id(l) in consumed:
            j += 1
            continue
        m = cap_re.match(l.text.strip())
        if m and (l.bold_prefix or l.size < bsize - 0.2) and not m.group(2).startswith("S"):
            kind = "table" if m.group(1).lower() == "table" else "figure"
            num = int(m.group(2))
            cap = m.group(3)
            k2 = j + 1
            while k2 < len(body_lines) and id(body_lines[k2]) not in consumed and body_lines[k2].page == l.page and body_lines[k2].size <= l.size + 0.3 and not cap_re.match(body_lines[k2].text) and 0 < body_lines[k2].top - body_lines[k2 - 1].top < l.size * 2.0 and body_lines[k2].size < bsize - 0.2 and not body_lines[k2].bold_prefix:
                cap = join(cap, body_lines[k2].text, vocab) if cap else body_lines[k2].text
                k2 += 1
            label = f"{'Table' if kind == 'table' else 'Fig.'} {num}"
            if kind == "table":
                tables[num].update(label=label, caption=cap.strip(), page=l.page)
            else:
                fig_caps[num] = {"label": label, "caption": cap.strip(), "page": l.page, "top": l.top}
            j = k2
            continue
        clean.append(l)
        j += 1
    # table caption lines may have been swallowed as "table lines" of another table: drop captions without a number match
    for n in list(tables):
        tables[n].setdefault("caption", ""); tables[n].setdefault("label", f"Table {n}"); tables[n].setdefault("page", tables[n]["cap_line"].page)

    # sections & paragraphs
    cur = None
    paras = []

    def newpar(kind, text, **kw):
        paras.append({"kind": kind, "text": text, **kw})

    last = None
    step = collections.Counter()
    for a, b in zip(clean, clean[1:]):
        if a.page == b.page and a.col == b.col and 0 < b.top - a.top < 30:
            step[round(b.top - a.top, 1)] += 1
    lh = step.most_common(1)[0][0] if step else bsize * 1.2
    col_left = collections.defaultdict(lambda: 1e9)
    for l in clean:
        if abs(l.size - bsize) < 0.6:
            col_left[(l.page, l.col)] = min(col_left[(l.page, l.col)], l.x0)
    prev = None
    decl_open = False
    for l in clean:
        t = l.text.strip()
        small = l.size < bsize - 0.5
        k = slug_kind(t)
        caps = t.isupper() and len(t) < 60 and bool(k)
        is_head = (l.bold or caps or (l.bold_prefix and l.bold_prefix == t)) and len(t) < 110 and not re.search(r"[,;]$", t) and (l.size >= bsize - 0.8 or bool(DECLARATION_HEADS.match(t)) or bool(k))
        if is_head and k and k not in ("_references",):
            decl_open = decl_open or k == "_declarations"
            newpar("h2", re.sub(r"^\d+(\.\d+)*\.?\s*", "", t), kind_hint=k)
            prev = None
            continue
        if is_head and DECLARATION_HEADS.match(t):
            decl_open = True
        if is_head and (DECLARATION_HEADS.match(t) or len(t.split()) <= 14):
            # merge multi-line sub-headings
            if paras and paras[-1]["kind"] == "h3" and prev is not None and prev.bold and prev.page == l.page and abs(l.top - prev.top) < lh * 1.4 and not paras[-1].get("closed"):
                paras[-1]["text"] = join(paras[-1]["text"], t, vocab)
            else:
                newpar("h3", re.sub(r"^\d+(\.\d+)*\.?\s+", "", t))
            prev = l
            continue
        if small and not decl_open:
            continue  # affiliations, notes, footers
        if re.match(r"^(Received|Accepted|Published|Revised)\s*:", t):
            continue
        col = col_left[(l.page, l.col)]
        dx = l.x0 - col
        bullet = re.match(r"^[•·▪‣–-]\s+", t)
        if bullet:
            newpar("li", t[bullet.end():])
        elif not paras or paras[-1]["kind"] in ("h2", "h3"):
            newpar("p", t)
        else:
            lp = paras[-1]
            gap = (l.top - prev.top) if prev is not None and prev.page == l.page and prev.col == l.col else 0
            indent = lh * 0.35 < dx < lh * 2.6
            if lp["kind"] == "li":
                if dx > lh * 0.9 and not indent or (dx >= lh * 1.3 and gap < lh * 1.7):
                    lp["text"] = join(lp["text"], t, vocab)
                elif indent:
                    newpar("p", t)
                else:
                    lp["text"] = join(lp["text"], t, vocab)
            elif (indent and gap < lh * 3) or gap > lh * 1.55 or (prev is not None and prev.x1 < (dims[l.page][0] * (0.5 if l.col else 0.9) - bsize * 3) and prev.text.rstrip().endswith((".", "!", "?")) and t[:1].isupper() and prev.col == l.col and prev.page == l.page and gap < lh * 1.5 and (prev.x1 - col) < 0.8 * (max(x.x1 for x in clean if x.page == l.page and x.col == l.col) - col)):
                newpar("p", t)
            else:
                lp["text"] = join(lp["text"], t, vocab)
        prev = l

    # build sections
    kind, head, buf = ("introduction", "Introduction", []) if unheaded else (None, None, [])
    decl = []
    in_decl = False

    def flush():
        nonlocal buf
        if kind and buf:
            body = "\n\n".join(buf).replace("\n\n- ", "\n- ")
            key = (kind, head)
            out_sections[key] = (out_sections[key] + "\n\n" + body) if key in out_sections else body
        buf = []

    for p in paras:
        t = p["text"].strip()
        if p["kind"] == "h2":
            kh = p["kind_hint"]
            if kh == "_declarations":
                flush(); kind = "ethics"; head = "Ethics declarations"; in_decl = True; continue
            if kh in ("_skip", "_abstract"):
                flush(); kind, head = None, None; continue
            flush(); in_decl = False
            kind, head = kh, (t.title() if t.isupper() else t)
            if kh == "results":
                head = t
            continue
        if p["kind"] == "h3":
            if DECLARATION_HEADS.match(t) and not in_decl:
                if re.match(r"availability of data|data availability", t, re.I):
                    flush(); kind, head = "data_availability", "Data availability"; continue
                flush(); kind = "ethics"; head = "Ethics declarations"; in_decl = True
            if kind:
                buf.append("### " + t)
            continue
        if kind:
            buf.append(("- " if p["kind"] == "li" else "") + t)
    flush()
    kinds_seen = [k for (k, h) in out_sections]
    for (kd, hd), body in out_sections.items():
        if kd == "data_availability" and body.startswith("### "):
            body = re.sub(r"^### [^\n]*\n\n", "", body)
        if kd == "ethics":
            # data availability inside declarations becomes its own section
            m2 = re.search(r"### (Availability of data[^\n]*|Data availability)\n\n(.*?)(?=\n\n### |\Z)", body, re.S)
            if m2:
                d["sections"].append({"kind": "data_availability", "heading": "Data availability", "body": m2.group(2).strip()})
                body = (body[:m2.start()] + body[m2.end():]).strip()
        if body:
            d["sections"].append({"kind": kd, "heading": hd if kd not in ("ethics",) else "Ethics declarations", "body": body.strip()})
    # markers for figures/tables
    tables_out, figs_out = [], []
    for num, f in sorted(fig_caps.items()):
        figs_out.append({"label": f["label"], "kind": "figure", "caption": f["caption"], "number": num, "page": f["page"]})
        _insert_marker(d["sections"], rf"\b(Fig\.?|Figure)\s*{num}\b", f"[[fig:{num}]]")
    for num, f in sorted(tables.items()):
        html, note = _table_html(f.get("lines", []))
        tables_out.append({"label": f["label"], "kind": "table", "caption": f["caption"], "number": num, "table_html": html, "note": note})
        if not html:
            res.warnings.append(f"table_{num}_needs_manual_entry")
        _insert_marker(d["sections"], rf"\bTable\s*{num}\b", f"[[table:{num}]]")
    d["figures"] = figs_out + tables_out

    # --- references
    d["references"] = parse_references(ref_lines, vocab, bsize)
    if not d["references"]:
        res.warnings.append("no_references")
    if not d["sections"]:
        res.warnings.append("no_sections")
    d["abstract_present"] = bool(d.get("abstract") or d.get("abstract_background"))
    _extract_images(pdf_bytes, d, res)
    return res


def _insert_marker(sections, rx, marker):
    """Put [[fig:N]] after the first paragraph that mentions the figure/table (outside headings)."""
    for s in sections:
        paras = s["body"].split("\n\n")
        for idx, p in enumerate(paras):
            if p.startswith(("### ", "- ", "[[")):
                continue
            if re.search(rx, p):
                paras.insert(idx + 1, marker)
                s["body"] = "\n\n".join(paras)
                return True
    return False


def _table_html(tlines):
    """Rebuild a grid from small-font lines. Returns (html, footnote). Best effort: always review in the CMS."""
    if len(tlines) < 6:
        return "", ""
    try:
        ls = sorted(tlines, key=lambda l: (l.top, l.x0))
        # footnote: trailing lines that are much wider than the first column (abbreviation list under the table)
        note, body = [], list(ls)
        xs_all = sorted({round(l.x0) for l in ls})
        first_w = (xs_all[1] - xs_all[0]) if len(xs_all) > 1 else 60
        while body and body[-1].x0 <= xs_all[0] + 2 and (body[-1].x1 - body[-1].x0) > first_w + 40:
            note.insert(0, body.pop())
        ls = body
        header = [l for l in ls if abs(l.top - ls[0].top) < 3]
        xs = sorted({round(l.x0) for l in header})
        cols = [xs[0]]
        for x in xs[1:]:
            if x - cols[-1] > 14:
                cols.append(x)
        n = len(cols)
        if n < 2:
            return "", ""

        def col_of(x):
            idx = 0
            for i, c in enumerate(cols):
                if x >= c - 8:
                    idx = i
            return idx

        percol = collections.defaultdict(list)
        for l in ls:
            percol[col_of(l.x0)].append(l.top)
        steps = [b - a for t in percol.values() for a, b in zip(sorted(t), sorted(t)[1:]) if 4 < b - a < 30]
        lh = collections.Counter(round(x, 1) for x in steps).most_common(1)[0][0] if steps else 10
        gapstart = collections.defaultdict(set)
        for c, tops_c in percol.items():
            tops_c = sorted(tops_c)
            for i, t in enumerate(tops_c):
                if i == 0 or t - tops_c[i - 1] > lh * 1.1:
                    gapstart[round(t * 2) / 2].add(c)
        starts = [t for t in sorted(gapstart) if len(gapstart[t]) >= max(2, n // 2)]
        if not starts:
            return "", ""
        rows = [collections.defaultdict(list) for _ in starts]
        for l in ls:
            ri = max(i for i, t in enumerate(starts) if l.top >= t - 1.5) if l.top >= starts[0] - 1.5 else 0
            rows[ri][col_of(l.x0)].append(l.text)

        def cell(parts):
            out = ""
            for p in parts:
                out = (out[:-1] + p) if out.endswith("-") and p[:1].islower() else (out + " " + p).strip()
            return _esc(out)

        html = "<table><thead><tr>" + "".join(f"<th>{cell(rows[0].get(i, []))}</th>" for i in range(n)) + "</tr></thead><tbody>"
        for r in rows[1:]:
            html += "<tr>" + "".join(f"<td>{cell(r.get(i, []))}</td>" for i in range(n)) + "</tr>"
        return html + "</tbody></table>", " ".join(l.text for l in note)
    except Exception:
        return "", ""


def _esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


NUM_ONLY = re.compile(r"^\[?(\d{1,3})[\].]?$")
INLINE = re.compile(r"^\[?(\d{1,3})[\].]\s+(\S.*)")


def parse_references(ref_lines, vocab, bsize):
    refs = collections.OrderedDict()
    blocks = collections.OrderedDict()
    for l in ref_lines:
        blocks.setdefault((l.page, l.col), []).append(l)

    def addtext(n, t):
        refs.setdefault(n, []).append(t)

    cur = None
    for (page, col), ls in blocks.items():
        ls = sorted(ls, key=lambda l: l.top)
        rows, row = [], []
        for l in ls:
            if row and l.top - row[0].top > 2.0:
                rows.append(sorted(row, key=lambda x: x.x0)); row = []
            row.append(l)
        if row:
            rows.append(sorted(row, key=lambda x: x.x0))
        left = min((l.x0 for l in ls), default=0)
        for r in rows:
            for l in r:
                t = l.text.strip()
                mo = NUM_ONLY.match(t)
                m = INLINE.match(t)
                if mo and l.x0 <= left + 6:
                    cur = int(mo.group(1))
                    refs.setdefault(cur, [])
                elif m and l.x0 <= left + 6:
                    cur = int(m.group(1))
                    refs[cur] = [m.group(2)]
                elif cur is not None:
                    refs.setdefault(cur, []).append(t)
    out = []
    for n in sorted(refs):
        parts = [p for p in refs[n] if p]
        if not parts:
            continue
        text = parts[0]
        for t in parts[1:]:
            last = text.split(" ")[-1]
            if re.search(r"(https?://|doi\.org/|\b10\.\d{4,9}/)\S*[/.\-\u2010]$", last) and re.match(r"[A-Za-z0-9]", t):
                first_tok, _, tail = t.partition(" ")
                text = text + first_tok + ((" " + tail) if tail else "")
            elif text.endswith("-") and (re.search(r"[/:]|https?", last) or t[:1].isdigit()):
                text += t
            elif text.endswith("-") and t[:1].islower():
                stem = re.sub(r"[^A-Za-z’']", "", last)
                first = re.sub(r"[^A-Za-z’']", "", t.split(" ")[0])
                text = text + t if (vocab[(stem + "-" + first).lower()] > 0 and vocab[(stem + first).lower()] == 0) else text[:-1] + t
            elif re.search(r"(https?://|www\.)\S*$", text) and " " not in last and not text.endswith(".") and (t.split(" ")[0].count("/") + t.split(" ")[0].count("-") > 0) and not re.match(r"^[A-Z][a-z]+\.?$", t.split(" ")[0]):
                text += t
            else:
                text += " " + t
        text = re.sub(r"\s+([.,;])", r"\1", text.replace("\u2010", "-")).replace("doi. org", "doi.org").replace("&#8230", "…")
        m = re.match(r"^(.+?(?:et al|[A-Z]{1,3}|Organization|Agency|Prevention))\.\s+(.+?[\.\?])\s+(.*)$", text)
        au, ti, so = (m.group(1), m.group(2), m.group(3)) if m and "http" not in m.group(1) else ("", "", "")
        doi = DOI_RE.search(text)
        url = re.search(r"https?://\S+", text)
        out.append({"number": n, "text": text, "authors": au, "title": ti, "source": so,
                    "doi": doi.group(1).rstrip(".,;") if doi else "", "url": url.group(0).rstrip(".,;") if url else ""})
    return out


def _extract_images(pdf_bytes, d, res):
    """Embedded raster images -> figures, matched to 'Fig. N' captions in page order."""
    try:
        from PIL import Image
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(pdf_bytes))
        found = []
        for pno, page in enumerate(reader.pages, 1):
            for img in page.images:
                try:
                    pil = Image.open(io.BytesIO(img.data))
                    if pil.width < 300 or pil.height < 150:
                        continue
                    if pil.mode not in ("RGB", "RGBA", "L"):
                        pil = pil.convert("RGB")
                    buf = io.BytesIO()
                    pil.save(buf, "PNG")
                    if len(buf.getvalue()) < 8_000_000:
                        found.append({"page": pno, "bytes": buf.getvalue()})
                except Exception:
                    continue
        figs = sorted([f for f in d["figures"] if f["kind"] == "figure"], key=lambda f: (f.get("page", 0), f["number"]))
        pairs, spare = [], list(found)
        for f in figs:  # same page first, then in reading order
            im = next((x for x in spare if x["page"] == f.get("page")), None)
            if im:
                spare.remove(im)
                pairs.append((f, im))
        pairs += list(zip([f for f in figs if f not in [p[0] for p in pairs]], spare)) if len(found) == len(figs) else []
        for f, im in pairs:
            res.images.append({"number": f["number"], "bytes": im["bytes"], "page": im["page"]})
            f["image"] = f"fig{f['number']}.png"
        if len(found) != len(figs):
            res.warnings.append("figure_count_mismatch")
    except Exception:
        res.warnings.append("images_failed")
