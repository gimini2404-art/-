# Article pages (scientific papers)

Any publication can have a full reading page at `/publications/<slug>/` (Arabic: `/ar/publications/<slug>/`).
The page shows when the publication has an abstract or at least one section.

## Load the bundled example
```bash
python manage.py load_article        # Mpox scoping review (CC BY 4.0): text, 10 authors, 2 figures, 1 table, 89 references, PDF
```

## Add another paper from the CMS
1. **Publications > Add publication**: fill *Publication*, then *Article page* (type, open access, dates, volume, DOI, licence) and *Abstract and content*.
2. Attach the PDF in *Publication* (enables **Download PDF**).
3. Use the inlines at the bottom: **Authors** (with affiliations; tick *corresponding*), **Sections** (Introduction, Methodology, Results, Discussion ...),
   **Figures/tables**, **References**, **Similar/related links**.
4. Section text markup: blank line = paragraph, `### Title` = sub-heading, `- item` = bullet, `[12]` or `[46-48]` links to the references,
   `[[fig:1]]` / `[[table:1]]` put a figure or table at that point.

Sections appear in a fixed academic order (abstract, introduction, methodology, results, discussion, ... references, author information,
ethics, rights, cite). Anything left empty is hidden (metrics, similar content, keywords, ...).

## Or load from a JSON file
`python manage.py load_article path/to/article.json` - same format as `core/fixtures/mpox_article/article.json`
(images/PDF are read from the same folder). Re-running updates the article matched by DOI.

## Built in
Sticky table of contents with scroll-spy, citation dialog (APA / BibTeX / RIS + downloads), save-for-later (browser), share, full-size table view,
Google Scholar metadata (`citation_*` tags) and JSON-LD for indexing, sitemap entry, RTL interface with the article text kept LTR.
