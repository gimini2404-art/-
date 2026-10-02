# SiaNexis website

Django site with a built-in CMS (Django admin). All content (pages, services, Research Hub, projects,
collaborations, publications, training, opportunities, contact requests) is edited at `/admin/` with no code changes.

## Run locally
```
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_sianexis        # research areas, services (EN + AR), roles (Editors / Contributors)
python manage.py createsuperuser
python manage.py runserver
```

## Production
Set env vars: `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`,
`CONTACT_EMAIL`, SMTP (`EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`), and for PostgreSQL
`DB_NAME/DB_USER/DB_PASSWORD/DB_HOST`. Then `python manage.py collectstatic` and serve with
`gunicorn sianexis.wsgi` behind HTTPS (SSL redirect, HSTS and secure cookies turn on automatically).

## Extending
- New Research Hub entries / programs / projects: add rows in the CMS.
- New page: CMS > Pages (tick "show in menu" to add to the navigation).
- Languages: English (`/en/`) and Arabic RTL (`/ar/`). Every content field has an English and an Arabic tab in the CMS;
  an empty Arabic field falls back to English. UI strings live in `tools/ar_translations.py`; after editing run
  `pip install polib && python tools/i18n_build.py` (rebuilds `locale/ar`, no GNU gettext needed).
- Another language: add it to `LANGUAGES` and `MODELTRANSLATION_LANGUAGES` in `sianexis/settings.py`, then `makemigrations && migrate`.
- Roles: group **Editors** (full content access) and **Contributors** (add/change, no delete, no site settings).
- SEO: per-page meta title/description, `/sitemap.xml`, `/robots.txt`, canonical + Open Graph tags.

## Features
- **Search** (`/search/`): across projects, publications, hub, news, training, opportunities, collaborations - English and Arabic.
- **News** (`/news/`): articles from CMS > Posts, shown on the home page.
- **Newsletter**: footer sign-up, stored in CMS > Newsletter subscribers (CSV export, unsubscribe link per subscriber).
- **Training registration**: each program has a registration page with optional seat capacity and automatic waiting list,
  confirmation email, status management and CSV export (CMS > Training registrations).
- **Contact requests**: auto-reply email to the sender, assign to a staff member (they get an email), status, CSV export,
  and a dashboard on the CMS home page with counters of what needs attention.
- **Publications**: filter by type/year/project, "Copy citation" (APA) and BibTeX buttons, and a CMS action
  "Fill missing details from DOI (Crossref)" (needs internet access from the server).

After pulling: `pip install -r requirements.txt && python manage.py migrate`.

## Trust, operations and integrations
- **Collaborations map** (Leaflet, needs internet for map tiles): add latitude/longitude, or use the CMS action *Fill coordinates from country*.
- **Team profile pages** with ORCID, Google Scholar and linked publications. **Impact metrics** and a **partners logo strip** on the home page (CMS > Impact metrics, Organizations > Partner).
- **Scheduling & drafts:** every content type has *Publish from / Hide after*; staff can preview drafts on the site; **History/Recover** (django-reversion) shows who changed what and restores old versions.
- **Images** are resized (max 1600px) and stored as WebP automatically.
- **Analytics & cookie consent:** set Google Analytics ID / Plausible domain in Site settings; GA loads only after the visitor accepts the cookie banner.
- **Form protection:** rate limiting, fill-time trap, honeypot, optional hCaptcha / reCAPTCHA / Turnstile (env vars).
- **CRM** webhook / HubSpot, **REST API** ([docs/API.md](docs/API.md)), **Docker + HTTPS + backups + CI** ([docs/DEPLOY.md](docs/DEPLOY.md)).
- Tests: `python manage.py test core`.
- **Article pages** for scientific papers (reader layout, TOC, citation export, references): see [docs/ARTICLES.md](docs/ARTICLES.md). `python manage.py load_article` loads the bundled example.
