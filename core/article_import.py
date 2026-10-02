"""Create/update a Publication with its full article page from extracted data (used by the CMS importer and `load_article`)."""
from datetime import date

from django.core.files.base import ContentFile

from . import models as m

SIMPLE = ["authors", "journal", "year", "volume", "issue", "article_number", "publisher", "issn", "content_type", "open_access", "license",
          "license_url", "keywords", "subjects", "abstract", "abstract_background", "abstract_methods", "abstract_results",
          "abstract_conclusion", "rights_text", "accesses", "citations", "altmetric", "mentions", "external_link"]


def _d(v):
    return date.fromisoformat(v) if v else None


def save_article(data, *, pdf_bytes=None, images=None, base_dir=None, publish=True, existing=None):
    """data follows core/fixtures/mpox_article/article.json. images: {figure_number: png/jpeg bytes}.
    base_dir: folder holding image files / paper.pdf referenced by the data (fixtures)."""
    images = images or {}
    pub = existing or (m.Publication.objects.filter(doi=data["doi"]).first() if data.get("doi") else None) or m.Publication(doi=data.get("doi", ""))
    for f in SIMPLE:
        if f in data and data[f] not in (None, ""):
            setattr(pub, f, data[f])
    pub.title_en = data["title"]
    pub.kind = "paper"
    pub.received_date = _d(data.get("received_date"))
    pub.accepted_date = _d(data.get("accepted_date"))
    pub.published_date = _d(data.get("published_date"))
    pub.is_published = publish
    pub.save()
    if not pub.slug:
        pub.slug = pub._make_slug()
        pub.save()
    if pdf_bytes is None and base_dir and (base_dir / "paper.pdf").exists() and not pub.pdf:
        pdf_bytes = (base_dir / "paper.pdf").read_bytes()
    if pdf_bytes:
        pub.pdf.save(f"{pub.slug}.pdf", ContentFile(pdf_bytes), save=False)
        pub.save()

    pub.author_list.all().delete()
    for i, a in enumerate(data.get("authors_detail", [])):
        m.ArticleAuthor.objects.create(publication=pub, order=i, name=a["name"], given_name=a.get("given_name", ""), family_name=a.get("family_name", ""),
                                       affiliation=a.get("affiliation", ""), corresponding=a.get("corresponding", False), email=a.get("email", ""),
                                       orcid=a.get("orcid", ""))
    pub.sections.all().delete()
    for i, s in enumerate(data.get("sections", [])):
        m.ArticleSection.objects.create(publication=pub, order=i, kind=s["kind"], heading=s.get("heading", ""), body=s["body"])
    pub.references.all().delete()
    m.ArticleReference.objects.bulk_create([
        m.ArticleReference(publication=pub, number=r["number"], text=r["text"], authors=r.get("authors", ""), title=r.get("title", ""),
                           source=r.get("source", ""), doi=r.get("doi", ""), url=r.get("url", "")) for r in data.get("references", [])])
    pub.figures.all().delete()
    for f in data.get("figures", []):
        fig = m.ArticleFigure(publication=pub, kind=f["kind"], number=f["number"], label=f.get("label", ""), caption=f.get("caption", ""),
                              table_html=f.get("table_html", ""), note=f.get("note", ""))
        blob = images.get(f["number"]) if f["kind"] == "figure" else None
        if blob:
            fig.image.save(f"fig{f['number']}.png", ContentFile(blob), save=False)
        elif f.get("image") and base_dir and (base_dir / f["image"]).exists():
            fig.image.save(f["image"], ContentFile((base_dir / f["image"]).read_bytes()), save=False)
        fig.save()
    pub.links.all().delete()
    for i, l in enumerate(data.get("links", [])):
        m.ArticleLink.objects.create(publication=pub, order=i, kind=l.get("kind", "similar"), title=l["title"], url=l["url"], source=l.get("source", ""))
    return pub
