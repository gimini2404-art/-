# Article pages (scientific papers)

Any publication can have a full reading page at `/publications/<slug>/` (Arabic: `/ar/publications/<slug>/`).
The page shows when the publication has an abstract or at least one section. Nothing empty is displayed.

## 1. Add a new paper from its PDF (recommended)
**CMS > Publications > "Import article from PDF"**
1. Upload the PDF (text PDF, up to 40 MB). Optionally type the DOI. Keep "Improve details with Crossref" ticked (needs internet).
2. The system extracts: title, authors and affiliations, abstract (with Background/Methods/Results/Conclusion), keywords, sections,
   figures (images), tables, references, licence, dates, DOI - and the PDF itself becomes the *Download PDF* button.
3. It is saved as a **draft** (not public). A message lists anything it could not detect.
4. Review/edit in the normal form (sections, references, authors...), use **View on site** to preview as staff, then tick **Published**.

What to check after an import: author names/affiliations, section headings, tables (rebuilt automatically when possible),
figure order, reference details. Scanned (image-only) PDFs are rejected; unusual layouts may need manual fixes.
With Crossref (internet) the DOI, journal/volume, licence, ORCID, affiliations and citation count are filled from the official record.

## 2. Add or edit manually
**Publications > Add publication** -> fill *Publication*, *Article page*, *Abstract and content*, attach the PDF, then use the inlines
(Authors, Sections, Figures/tables, References, Similar links). Section text markup: blank line = paragraph, `### Title` = sub-heading,
`- item` = bullet, `[12]` / `[46-48]` link to references, `[[fig:1]]` / `[[table:1]]` place a figure or table.

## 3. From a JSON file (developers)
`python manage.py load_article path/to/article.json` (same format as `core/fixtures/mpox_article/article.json`).
`python manage.py load_article` loads the bundled example (Mpox scoping review, CC BY 4.0).

## Scheduling / drafts
Every article has *Publish from / Hide after*. Drafts and scheduled articles are visible only to logged-in staff (banner "Preview mode").

## Built in
Sticky table of contents with scroll-spy, cite dialog (APA / BibTeX / RIS + downloads), save-for-later (browser), share, full-size table view,
Google Scholar metadata (`citation_*` tags) and JSON-LD, sitemap entry, RTL interface with the article text kept LTR.
