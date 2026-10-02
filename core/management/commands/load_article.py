"""Load a full article page (text, authors, figures, table, references, PDF) from a JSON fixture.

    python manage.py load_article                       # loads the bundled Mpox scoping review (CC BY 4.0)
    python manage.py load_article path/to/article.json  # any article in the same format
Re-running updates the same article (matched by DOI).
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand

from core.article_import import save_article

DEFAULT = Path(__file__).resolve().parents[2] / "fixtures" / "mpox_article" / "article.json"


class Command(BaseCommand):
    def add_arguments(self, parser):
        parser.add_argument("path", nargs="?", default=str(DEFAULT))

    def handle(self, *args, **opts):
        path = Path(opts["path"])
        data = json.loads(path.read_text(encoding="utf-8"))
        pub = save_article(data, base_dir=path.parent, publish=True)
        self.stdout.write(self.style.SUCCESS(f"Article loaded: /publications/{pub.slug}/  ({pub.references.count()} references, {pub.sections.count()} sections)"))
