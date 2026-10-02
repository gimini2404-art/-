"""Load a full article page (text, authors, figures, table, references, PDF) from a JSON fixture.

    python manage.py load_article                       # loads the bundled Mpox scoping review (CC BY 4.0)
    python manage.py load_article path/to/article.json  # any article in the same format
Re-running updates the same article (matched by DOI).
"""
import json
from datetime import date
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand

from core import models as m

DEFAULT = Path(__file__).resolve().parents[2] / "fixtures" / "mpox_article" / "article.json"


def d(v):
    return date.fromisoformat(v) if v else None


class Command(BaseCommand):
    def add_arguments(self, parser):
        parser.add_argument("path", nargs="?", default=str(DEFAULT))

    def handle(self, *args, **opts):
        path = Path(opts["path"])
        data = json.loads(path.read_text(encoding="utf-8"))
        base = path.parent
        pub = m.Publication.objects.filter(doi=data["doi"]).first() or m.Publication(doi=data["doi"])
        simple = ["authors", "journal", "year", "volume", "article_number", "publisher", "issn", "content_type", "open_access", "license",
                  "license_url", "keywords", "subjects", "abstract", "abstract_background", "abstract_methods", "abstract_results",
                  "abstract_conclusion", "rights_text", "accesses", "citations", "altmetric", "mentions", "issue"]
        for f in simple:
            if f in data:
                setattr(pub, f, data[f])
        pub.title_en = data["title"]
        pub.kind = "paper"
        pub.received_date, pub.accepted_date, pub.published_date = d(data.get("received_date")), d(data.get("accepted_date")), d(data.get("published_date"))
        pub.save()
        if not pub.slug:
            pub.slug = pub._make_slug()
        pdf = base / "paper.pdf"
        if pdf.exists() and not pub.pdf:
            with pdf.open("rb") as fh:
                pub.pdf.save(f"{pub.slug}.pdf", File(fh), save=False)
        pub.save()

        pub.author_list.all().delete()
        for i, a in enumerate(data.get("authors_detail", [])):
            m.ArticleAuthor.objects.create(publication=pub, order=i, name=a["name"], given_name=a.get("given_name", ""), family_name=a.get("family_name", ""),
                                           affiliation=a.get("affiliation", ""), corresponding=a.get("corresponding", False), email=a.get("email", ""), orcid=a.get("orcid", ""))
        pub.sections.all().delete()
        for i, s in enumerate(data.get("sections", [])):
            m.ArticleSection.objects.create(publication=pub, order=i, kind=s["kind"], heading=s.get("heading", ""), body=s["body"])
        pub.references.all().delete()
        m.ArticleReference.objects.bulk_create([m.ArticleReference(publication=pub, number=r["number"], text=r["text"], authors=r.get("authors", ""),
                                                                   title=r.get("title", ""), source=r.get("source", ""), doi=r.get("doi", ""), url=r.get("url", ""))
                                                for r in data.get("references", [])])
        pub.figures.all().delete()
        for f in data.get("figures", []):
            fig = m.ArticleFigure(publication=pub, kind=f["kind"], number=f["number"], label=f.get("label", ""), caption=f.get("caption", ""),
                                  table_html=f.get("table_html", ""), note=f.get("note", ""))
            if f.get("image") and (base / f["image"]).exists():
                with (base / f["image"]).open("rb") as fh:
                    fig.image.save(f["image"], File(fh), save=False)
            fig.save()
        pub.links.all().delete()
        for i, l in enumerate(data.get("links", [])):
            m.ArticleLink.objects.create(publication=pub, order=i, kind=l.get("kind", "similar"), title=l["title"], url=l["url"], source=l.get("source", ""))
        self.stdout.write(self.style.SUCCESS(f"Article loaded: /publications/{pub.slug}/  ({pub.references.count()} references, {pub.sections.count()} sections)"))
