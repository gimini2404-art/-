# Article pages (scientific papers)

Any publication can have a full reading page at `/publications/<slug>/` (Arabic: `/ar/publications/<slug>/`).
The page shows when the publication has an abstract or at least one section. Nothing empty is displayed.

## 1. Add a new paper from its PDF (the easy way)
On the CMS home page press the big green **Add a research paper** button (or Publications > Add a research paper):
1. Drag the PDF onto the box (or click it to choose).
2. Press **Publish now** (live immediately) or **Save as draft first** (only staff can see it).
3. A result page shows what was found and offers **View the paper**, **Undo (hide it)** / **Publish now**, and **Edit details**.

The system builds everything: title, authors and affiliations, structured abstract, keywords, sections, figures, tables, numbered
references, licence, dates, DOI, and the PDF becomes the *Download PDF* button. Crossref (when internet is available) improves the details
automatically. If the same DOI already exists you are asked "replace it?" - nothing is duplicated.
No PDF? Paste DOIs in the box under it to add papers to the publications list (title/authors/journal come from Crossref).

What to check once: author names/affiliations, section headings, tables, figure order, reference details.
Scanned (image-only) PDFs are rejected; unusual layouts may need manual fixes in **Edit details**.

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
