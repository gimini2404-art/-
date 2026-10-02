# Free hosting (no Blaze plan, no Cloud Run)

Firebase's free **Spark** plan cannot run Django (Hosting is static-only; Cloud Run/Cloud SQL need Blaze). What *does* work on Spark:

| Piece | Free on Spark? | Needed for |
|---|---|---|
| Firebase Authentication (Google sign-in) | Yes | "Continue with Google" button |
| Firestore (free quota) | Yes | optional one-way mirror of student data |
| Firebase Hosting / Cloud Run / Cloud SQL | Hosting yes (static only) – the others no | not needed |

So: **run Django on a free host, keep Firebase only for Auth (+ optional Firestore mirror).** Leave `FIREBASE_HOSTING` unset and don't set `GS_*`.

## Option A – PythonAnywhere free account (easiest, no card; good for a demo / pilot)
Gives `https://YOURNAME.pythonanywhere.com`, a persistent disk (SQLite and uploads just work).

1. Create an account at pythonanywhere.com → **Consoles → Bash**:
   ```bash
   git clone https://github.com/gimini2404-art/- sianexis && cd sianexis
   git checkout claude/stoic-hopper-jmzjzg
   python3.12 -m venv ~/venv && source ~/venv/bin/activate
   pip install -r requirements.txt google-auth requests
   python manage.py migrate && python manage.py seed_sianexis && python manage.py createsuperuser
   DJANGO_DEBUG=0 DJANGO_SECRET_KEY=x DJANGO_ALLOWED_HOSTS=x python manage.py collectstatic --noinput
   ```
2. **Web → Add a new web app → Manual configuration (Python 3.12)**. Virtualenv: `/home/YOURNAME/venv`.
3. **Static files:** URL `/static/` → `/home/YOURNAME/sianexis/staticfiles`; URL `/media/` → `/home/YOURNAME/sianexis/media`.
4. Edit the **WSGI file** shown on the Web tab:
   ```python
   import os, sys
   sys.path.insert(0, "/home/YOURNAME/sianexis")
   os.environ.update({
       "DJANGO_SETTINGS_MODULE": "sianexis.settings",
       "DJANGO_DEBUG": "0",
       "DJANGO_SECRET_KEY": "PUT-A-LONG-RANDOM-STRING",
       "DJANGO_ALLOWED_HOSTS": "YOURNAME.pythonanywhere.com",
       "DJANGO_CSRF_TRUSTED_ORIGINS": "https://YOURNAME.pythonanywhere.com",
       "TRUST_PROXY": "1",
       "DJANGO_SSL_REDIRECT": "0",  # turn on "Force HTTPS" in the Web tab instead (avoids redirect loops)
       # Email (students must receive the confirmation link): Gmail + an app password
       "EMAIL_HOST": "smtp.gmail.com", "EMAIL_PORT": "587",
       "EMAIL_HOST_USER": "siacore.network@gmail.com", "EMAIL_HOST_PASSWORD": "GMAIL-APP-PASSWORD",
       "DEFAULT_FROM_EMAIL": "siacore.network@gmail.com", "CONTACT_EMAIL": "siacore.network@gmail.com",
       # Firebase (optional): Google sign-in
       "FIREBASE_PROJECT_ID": "your-project-id",
       "FIREBASE_WEB_API_KEY": "your-web-api-key",
   })
   from django.core.wsgi import get_wsgi_application
   application = get_wsgi_application()
   ```
5. Press **Reload**. In Firebase *Authentication → Settings → Authorized domains* add `YOURNAME.pythonanywhere.com`.

Limits to know (check the current terms on their site): one web app, small CPU quota, the site must be re-enabled (a "Run until 1 month from today" button) every month, and free accounts can only reach whitelisted outside hosts. Google's token-verification and Gmail SMTP hosts are normally on that list, but **confirm** (Google sign-in will say "Could not verify your Google account" if blocked; confirmation emails need a working `EMAIL_HOST`, e.g. Gmail with an app password).
Updating later: `cd ~/sianexis && git pull && python manage.py migrate && python manage.py collectstatic --noinput` then Reload.

## Option B – Oracle Cloud "Always Free" VM (best free option for the real site)
A free always-on VM (ARM up to 4 CPU / 24 GB at the time of writing; needs a card for identity verification, not charged on Always Free). It runs the project's own `docker-compose.yml` (PostgreSQL, Caddy with automatic HTTPS, daily backups) – see [DEPLOY.md](DEPLOY.md). Point a domain at the VM's IP (a free subdomain from DuckDNS works). Set the same `FIREBASE_*` variables in `.env`. More work than Option A but no sleeping, no monthly renewal.

## Not recommended
* Render/Koyeb free web services sleep when idle and have no persistent disk (your uploads and SQLite would vanish on redeploy); free databases there may expire.

## Firebase side (free)
Do steps 1–4 of [FIREBASE.md](FIREBASE.md) on the **Spark** plan (no billing): create the project, enable Google sign-in, copy the web API key. For the optional Firestore mirror also create the database and a service-account key (Project settings → Service accounts → Generate key), then set `FIREBASE_FIRESTORE_MIRROR=1` and `FIREBASE_SERVICE_ACCOUNT_JSON` to the key's JSON (store it as a secret/env var, never in git). Skip the mirror if you don't need it.
