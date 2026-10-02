# Firebase / Google Cloud setup

Account to use: **siacore.network@gmail.com** (create the Firebase project while signed in with it).

## What is connected and how

| Firebase product | What it does here | Notes |
|---|---|---|
| **Hosting** | Public address (`https://PROJECT.web.app` + your own domain) in front of the site | Hosting serves static files only, so the Django site itself runs on **Cloud Run**; Hosting forwards every request to it (`firebase.json`). |
| **Authentication** | **Continue with Google** on the student login/sign-up pages | Email + password accounts still work (students already registered, staff, password reset). Staff accounts can never sign in through Google. |
| **Firestore** | One-way **mirror** of students, enrollments and project requests | Django's database stays the source of truth. Firestore cannot replace it: the CMS, admin, history and translations all use the relational ORM. |

Because Cloud Run has no persistent disk you also need: **Cloud SQL (PostgreSQL)** for the database and **Cloud Storage** buckets for uploads. Both are wired in through environment variables.

## One-time setup (about 30 minutes)

1. Sign in to <https://console.firebase.google.com> with siacore.network@gmail.com → **Add project** (e.g. `sianexis`). Upgrade to the **Blaze** plan (Cloud Run + Cloud SQL need billing; the free quotas are generous).
2. **Authentication → Sign-in method → Google → Enable.** Under *Settings → Authorized domains* add your final domain.
3. **Project settings → General → Your apps → Web app (</>)** → register an app; copy `apiKey` (this is public) → `FIREBASE_WEB_API_KEY`.
4. **Firestore Database → Create database** (production mode, a region near you). Rules are deployed from `firestore.rules` (deny-all for browsers).
5. Install tools: `npm i -g firebase-tools` and the Google Cloud CLI (`gcloud`). Run `firebase login` and `gcloud auth login` with the same Google account.
6. `cp .firebaserc.example .firebaserc` and put your project id in it.

## Create the backing services (gcloud)

```bash
PROJECT=your-project-id   REGION=europe-west1
gcloud config set project $PROJECT
gcloud services enable run.googleapis.com sqladmin.googleapis.com firestore.googleapis.com storage.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# Database
gcloud sql instances create sianexis-db --database-version=POSTGRES_16 --tier=db-f1-micro --region=$REGION
gcloud sql databases create sianexis --instance=sianexis-db
gcloud sql users create sianexis --instance=sianexis-db --password='CHOOSE-A-STRONG-PASSWORD'

# Buckets: public images, private student files
gcloud storage buckets create gs://$PROJECT-media   --location=$REGION --uniform-bucket-level-access
gcloud storage buckets create gs://$PROJECT-private --location=$REGION --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://$PROJECT-media --member=allUsers --role=roles/storage.objectViewer   # images only
```

## Deploy the site to Cloud Run

```bash
gcloud run deploy sianexis --source . --region $REGION --port 8000 --allow-unauthenticated \
  --add-cloudsql-instances $PROJECT:$REGION:sianexis-db \
  --set-env-vars "DJANGO_DEBUG=0,DJANGO_ALLOWED_HOSTS=$PROJECT.web.app,$PROJECT.firebaseapp.com,DJANGO_CSRF_TRUSTED_ORIGINS=https://$PROJECT.web.app,https://$PROJECT.firebaseapp.com,\
FIREBASE_HOSTING=1,TRUST_PROXY=1,DB_NAME=sianexis,DB_USER=sianexis,DB_HOST=/cloudsql/$PROJECT:$REGION:sianexis-db,\
FIREBASE_PROJECT_ID=$PROJECT,FIREBASE_WEB_API_KEY=YOUR_WEB_API_KEY,FIREBASE_FIRESTORE_MIRROR=1,\
GS_BUCKET_NAME=$PROJECT-media,GS_PRIVATE_BUCKET_NAME=$PROJECT-private,RUN_SEED=0" \
  --set-secrets "DJANGO_SECRET_KEY=django-secret:latest,DB_PASSWORD=db-password:latest"
```

(Create the two secrets first with `gcloud secrets create ...`; do not put them in the command line or in git. Add `DJANGO_SUPERUSER_USERNAME/PASSWORD/EMAIL` for the first run only, then remove them. Set `EMAIL_HOST*` to a real SMTP service so confirmation emails are delivered.)

Give the Cloud Run service account access to Firestore and the buckets:

```bash
SA=$(gcloud run services describe sianexis --region $REGION --format 'value(spec.template.spec.serviceAccountName)')
for ROLE in roles/datastore.user roles/cloudsql.client; do gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=$ROLE; done
for B in media private; do gcloud storage buckets add-iam-policy-binding gs://$PROJECT-$B --member=serviceAccount:$SA --role=roles/storage.objectAdmin; done
```

## Publish through Firebase Hosting

```bash
firebase deploy --only hosting,firestore:rules
```
The site is now at `https://PROJECT.web.app`. Add your own domain under *Hosting → Add custom domain*.

## Good to know

* **Cookies:** Firebase Hosting only forwards a cookie named `__session`, so `FIREBASE_HOSTING=1` stores the session and CSRF token in it. Without that flag login would fail behind Hosting.
* **Languages** use the URL prefix (`/en/`, `/ar/`), so they are unaffected.
* **Google sign-in** needs `FIREBASE_PROJECT_ID` and `FIREBASE_WEB_API_KEY`; when they are empty the button simply does not appear.
* **Firestore mirror** documents: `students/{userId}`, `enrollments/{id}`, `projectRequests/{id}`. They contain names, emails, statuses and titles, never passwords or proposal texts. Existing students are mirrored the next time their record is saved.
* **Costs:** Cloud Run and Firebase have free tiers; Cloud SQL is a paid service (the smallest instance is the main fixed cost). If you prefer to avoid it, run the site on a small VPS with the included `docker-compose.yml` instead (the Google sign-in and Firestore mirror work there too; only Hosting and Cloud Run are skipped).
* **Local development** needs none of this: leave the `FIREBASE_*` variables empty.
