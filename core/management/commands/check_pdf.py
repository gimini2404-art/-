"""Diagnose why a PDF does not import:  python manage.py check_pdf path/to/paper.pdf"""
import traceback
from pathlib import Path

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Show what the article importer finds in a PDF (or the exact error)."

    def add_arguments(self, parser):
        parser.add_argument("path")

    def handle(self, *args, **opts):
        raw = Path(opts["path"]).read_bytes()
        self.stdout.write(f"File: {opts['path']}  ({len(raw) / 1048576:.1f} MB), starts with {raw[:8]!r}")
        for lib in ("pdfminer", "pypdf", "PIL"):
            try:
                __import__(lib)
                self.stdout.write(f"  library {lib}: OK")
            except ImportError as exc:
                self.stdout.write(self.style.ERROR(f"  library {lib}: MISSING -> run: pip install -r requirements.txt"))
        from core.pdf_extract import extract

        try:
            res = extract(raw)
        except Exception:
            self.stdout.write(self.style.ERROR("Extraction failed:"))
            self.stdout.write(traceback.format_exc())
            return
        d = res.data
        self.stdout.write(self.style.SUCCESS("Extraction worked."))
        self.stdout.write(f"  warnings: {res.warnings or 'none'}")
        self.stdout.write(f"  title: {d.get('title')!r}\n  DOI: {d.get('doi')!r}  journal: {d.get('journal')!r}  year: {d.get('year')}")
        self.stdout.write(f"  authors: {len(d.get('authors_detail', []))}  sections: {[s['kind'] for s in d.get('sections', [])]}")
        self.stdout.write(f"  references: {len(d.get('references', []))}  figures/tables: {len(d.get('figures', []))}  images: {len(res.images)}")
