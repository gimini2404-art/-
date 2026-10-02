# SiaNexis website

Django site with a built-in CMS (Django admin). All content (pages, services, Research Hub, projects,
collaborations, publications, training, opportunities, contact requests) is edited at `/admin/` with no code changes.

## Run locally
```
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_sianexis        # research areas, services, roles (Editors / Contributors)
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
- New language: add it to `LANGUAGES` in `sianexis/settings.py`, run `makemigrations`-free `makemessages`.
- Roles: group **Editors** (full content access) and **Contributors** (add/change, no delete, no site settings).
- SEO: per-page meta title/description, `/sitemap.xml`, `/robots.txt`, canonical + Open Graph tags.
