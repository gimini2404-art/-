"""Presentation logic for article pages: section order, body markup, citations."""
import re

from django.utils.html import escape
from django.utils.safestring import mark_safe
from django.utils.translation import gettext as _

IMRAD = ["introduction", "background", "methodology", "methods", "results", "discussion", "limitations", "conclusion", "conclusions"]
SHORT = ["background", "methods", "results", "conclusion", "introduction", "methodology", "discussion", "limitations", "conclusions"]
TAIL_KINDS = ["data_availability", "author_info", "ethics"]


def ordered_sections(pub):
    secs = list(pub.sections.all())
    order = IMRAD if any(s.kind == "introduction" for s in secs) else SHORT
    rank = {k: i for i, k in enumerate(order)}
    body = [s for s in secs if s.kind in rank or s.kind == "other"]
    body.sort(key=lambda s: (rank.get(s.kind, len(rank)), s.order, s.id))
    tail = [s for s in secs if s.kind in TAIL_KINDS]
    tail.sort(key=lambda s: (TAIL_KINDS.index(s.kind), s.order))
    return body, tail


CITE = re.compile(r"\[(\d+(?:\s*[–-]\s*\d+)?(?:\s*,\s*\d+(?:\s*[–-]\s*\d+)?)*)\]")


def _link_citations(text, max_ref):
    def repl(m):
        parts = []
        for tok in re.split(r"\s*,\s*", m.group(1)):
            first = int(re.match(r"\d+", tok).group(0))
            parts.append(f'<a href="#ref-{first}" class="cite-ref">{tok}</a>' if first <= max_ref else tok)
        return "[" + ", ".join(parts) + "]"

    return CITE.sub(repl, text)


def figure_html(fig):
    label = escape(fig.label or f"{fig.get_kind_display()} {fig.number}")
    cap = escape(fig.caption)
    note = f'<p class="fig-note">{escape(fig.note)}</p>' if fig.note else ""
    if fig.kind == "table" and not fig.table_html:
        return ""
    if fig.kind == "table":
        inner = (f'<div class="table-wrap" tabindex="0">{fig.table_html}</div>'
                 f'<p class="fig-full"><button type="button" class="art-linkbtn" data-open-dialog="table-dialog-{fig.number}">{escape(_("Full size table"))}</button></p>'
                 f'<dialog id="table-dialog-{fig.number}" class="art-dialog art-dialog-wide" aria-label="{label}">'
                 f'<form method="dialog" class="dlg-close"><button aria-label="{escape(_("Close"))}">×</button></form>'
                 f'<h2>{label}</h2><p>{cap}</p><div class="table-wrap table-full" tabindex="0">{fig.table_html}</div>{note}</dialog>')
    elif fig.image:
        inner = f'<a href="{fig.image.url}" target="_blank" rel="noopener"><img src="{fig.image.url}" alt="{label}. {cap}" loading="lazy"></a>'
    else:
        inner = ""
    return (f'<figure class="art-fig" id="{fig.kind}-{fig.number}"><figcaption><strong>{label}</strong> {cap}</figcaption>{inner}{note}</figure>')


def render_body(text, pub, figures):
    """Light markup -> HTML (escaped). Admin-entered tables are the only raw HTML and come from ArticleFigure."""
    max_ref = max((r.number for r in pub.references.all()), default=0) if hasattr(pub, "references") else 0
    html, items = [], []

    def flush_list():
        if items:
            html.append("<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>")
            items.clear()

    for block in re.split(r"\n\s*\n", (text or "").strip()):
        block = block.strip()
        if not block:
            continue
        m = re.fullmatch(r"\[\[(fig|figure|table):(\d+)\]\]", block)
        if m:
            flush_list()
            kind = "table" if m.group(1) == "table" else "figure"
            fig = figures.get((kind, int(m.group(2))))
            if fig:
                html.append(figure_html(fig))
            continue
        if block.startswith("### "):
            flush_list()
            html.append(f"<h3>{escape(block[4:])}</h3>")
            continue
        lines = block.split("\n")
        if all(l.startswith("- ") for l in lines):
            for l in lines:
                items.append(_link_citations(escape(l[2:]), max_ref))
            flush_list()
            continue
        flush_list()
        html.append(f"<p>{_link_citations(escape(block), max_ref)}</p>")
    flush_list()
    return mark_safe("\n".join(html))


# ---- citations ------------------------------------------------------------------------------
def _authors(pub):
    people = list(pub.author_list.all())
    if people:
        return [(p.family, p.given, p.initials) for p in people]
    out = []
    for name in [a.strip() for a in pub.authors.split(",") if a.strip()]:
        parts = name.split()
        out.append((parts[-1], " ".join(parts[:-1]), " ".join(f"{x[0]}." for x in parts[:-1])))
    return out


def _title(pub):
    return getattr(pub, "title_en", None) or pub.title


def cite_apa(pub):
    au = _authors(pub)
    names = [f"{f}, {i}".strip().rstrip(",") for f, g, i in au]
    if len(names) > 1:
        who = ", ".join(names[:-1]) + ", & " + names[-1]
    else:
        who = names[0] if names else ""
    vol = pub.volume + (f"({pub.issue})" if pub.issue else "") if pub.volume else ""
    src = ", ".join(x for x in [pub.journal, vol, pub.article_number] if x)
    parts = [f"{who} ({pub.year or 'n.d.'}). {_title(pub).rstrip('.')}."]
    if src:
        parts.append(f"{src}.")
    if pub.doi:
        parts.append(pub.doi_url)
    return " ".join(parts)


def cite_bibtex(pub):
    au = _authors(pub)
    key = re.sub(r"[^A-Za-z0-9]", "", (au[0][0] if au else "ref")) + str(pub.year or "")
    fields = [("title", _title(pub)), ("author", " and ".join(f"{f}, {g}".strip(", ") for f, g, _i in au)), ("journal", pub.journal),
              ("year", pub.year or ""), ("volume", pub.volume), ("number", pub.issue), ("pages", pub.article_number),
              ("publisher", pub.publisher), ("doi", pub.doi), ("url", pub.doi_url)]
    body = ",\n".join(f"  {k} = {{{v}}}" for k, v in fields if v)
    return f"@article{{{key},\n{body}\n}}"


def cite_ris(pub):
    lines = ["TY  - JOUR", f"TI  - {_title(pub)}"]
    lines += [f"AU  - {f}, {g}".rstrip(", ") for f, g, _i in _authors(pub)]
    for tag, val in (("JO", pub.journal), ("PY", pub.year), ("VL", pub.volume), ("IS", pub.issue), ("SP", pub.article_number),
                     ("DO", pub.doi), ("UR", pub.doi_url), ("PB", pub.publisher), ("SN", pub.issn)):
        if val:
            lines.append(f"{tag}  - {val}")
    lines += [f"KW  - {k}" for k in pub.keyword_list]
    abstract = pub.abstract or " ".join(x for x in (pub.abstract_background, pub.abstract_methods, pub.abstract_results, pub.abstract_conclusion) if x)
    if abstract:
        lines.append(f"AB  - {abstract}")
    lines.append("ER  - ")
    return "\r\n".join(lines) + "\r\n"


def abstract_parts(pub):
    parts = [(_("Background"), pub.abstract_background), (_("Methods"), pub.abstract_methods),
             (_("Results"), pub.abstract_results), (_("Conclusion"), pub.abstract_conclusion)]
    return [(h, t) for h, t in parts if t]
