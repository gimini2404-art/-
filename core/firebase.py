"""Firebase / Google Cloud integration. Everything is optional and configured with environment variables.

* Firebase Authentication: "Continue with Google" for students (the browser signs in with the Firebase JS SDK and sends
  the ID token to /account/firebase/, which verifies it here). The normal email + password accounts keep working.
* Firestore mirror: student profiles, enrollments and project requests are copied to Firestore through the REST API.
  Django's database stays the source of truth; the mirror is one-way and failures never block the website.
"""
import json
import logging
import threading
from datetime import date, datetime

from django.conf import settings
from django.db.models.signals import post_delete, post_save

log = logging.getLogger(__name__)
SCOPES = ["https://www.googleapis.com/auth/datastore"]
_session = None


# ------------------------------------------------------------------ Authentication
def auth_enabled():
    return bool(settings.FIREBASE_PROJECT_ID and settings.FIREBASE_WEB_API_KEY)


def web_config():
    """Public web config for the Firebase JS SDK (these values are not secrets)."""
    if not auth_enabled():
        return None
    return {"apiKey": settings.FIREBASE_WEB_API_KEY, "authDomain": settings.FIREBASE_AUTH_DOMAIN, "projectId": settings.FIREBASE_PROJECT_ID}


def verify_id_token(token):
    """Return the verified claims of a Firebase ID token or raise ValueError."""
    from google.auth.transport import requests as greq
    from google.oauth2 import id_token

    project = settings.FIREBASE_PROJECT_ID
    claims = id_token.verify_firebase_token(token, greq.Request(), audience=project)
    if not claims or claims.get("iss") != f"https://securetoken.google.com/{project}" or not claims.get("sub"):
        raise ValueError("invalid Firebase token")
    return claims


# ------------------------------------------------------------------ Firestore mirror (REST)
def mirror_enabled():
    return bool(settings.FIREBASE_FIRESTORE_MIRROR and settings.FIREBASE_PROJECT_ID)


def _get_session():
    global _session
    if _session is None:
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2 import service_account

        if settings.FIREBASE_SERVICE_ACCOUNT_JSON:
            creds = service_account.Credentials.from_service_account_info(json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON), scopes=SCOPES)
        else:
            creds, _p = google.auth.default(scopes=SCOPES)  # Cloud Run / gcloud application-default credentials
        _session = AuthorizedSession(creds)
    return _session


def _value(v):
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, datetime):
        return {"timestampValue": v.isoformat()}
    if isinstance(v, date):
        return {"stringValue": v.isoformat()}
    return {"stringValue": str(v)}


def _doc_url(collection, doc_id):
    return f"https://firestore.googleapis.com/v1/projects/{settings.FIREBASE_PROJECT_ID}/databases/(default)/documents/{collection}/{doc_id}"


def _upsert(collection, doc_id, data):
    r = _get_session().patch(_doc_url(collection, doc_id), json={"fields": {k: _value(v) for k, v in data.items()}}, timeout=10)
    r.raise_for_status()


def _delete(collection, doc_id):
    r = _get_session().delete(_doc_url(collection, doc_id), timeout=10)
    if r.status_code != 404:
        r.raise_for_status()


def _run(fn, *args):
    def job():
        try:
            fn(*args)
        except Exception:
            log.exception("Firestore mirror failed")

    if getattr(settings, "FIREBASE_ASYNC", True):
        threading.Thread(target=job, daemon=True).start()
    else:
        job()


def serialize(instance):
    """(collection, doc_id, data) for a mirrored object. Only what dashboards need: no passwords, no proposal texts."""
    name = type(instance).__name__
    if name == "StudentProfile":
        u = instance.user
        return "students", str(u.pk), {"name": instance.full_name, "email": u.email, "university": instance.university,
                                       "fieldOfStudy": instance.field_of_study, "language": instance.language,
                                       "emailVerified": instance.email_verified, "created": instance.created}
    if name == "Enrollment":
        return "enrollments", str(instance.pk), {"studentId": str(instance.student_id), "studentEmail": instance.student.email,
                                                  "programSlug": instance.program.slug, "programTitle": instance.program.title,
                                                  "status": instance.status, "updated": instance.updated}
    if name == "ProjectRequest":
        return "projectRequests", str(instance.pk), {"studentId": str(instance.student_id), "studentEmail": instance.student.email,
                                                      "title": instance.title, "status": instance.status,
                                                      "researchArea": str(instance.research_area) if instance.research_area_id else "",
                                                      "updated": instance.updated}
    return None


def _on_save(sender, instance, **kwargs):
    if mirror_enabled() and not kwargs.get("raw"):
        spec = serialize(instance)
        if spec:
            _run(_upsert, *spec)


def _on_delete(sender, instance, **kwargs):
    if mirror_enabled():
        spec = serialize(instance)
        if spec:
            _run(_delete, spec[0], spec[1])


def connect_signals():
    from . import models as m

    for model in (m.StudentProfile, m.Enrollment, m.ProjectRequest):
        post_save.connect(_on_save, sender=model, dispatch_uid=f"fb-save-{model.__name__}")
        post_delete.connect(_on_delete, sender=model, dispatch_uid=f"fb-del-{model.__name__}")
