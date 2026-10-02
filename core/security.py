"""Form protection: rate limiting, a minimum-fill-time trap, honeypot (in the forms) and optional CAPTCHA."""
import json
import logging
import time
import urllib.parse
import urllib.request

from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.utils.translation import gettext as _

log = logging.getLogger(__name__)

MIN_FILL_SECONDS = 3
MAX_FORM_AGE = 60 * 60 * 24
SALT = "sianexis.form"

CAPTCHA_ENDPOINTS = {
    "hcaptcha": ("https://hcaptcha.com/siteverify", "h-captcha-response", "https://js.hcaptcha.com/1/api.js", "h-captcha"),
    "recaptcha": ("https://www.google.com/recaptcha/api/siteverify", "g-recaptcha-response", "https://www.google.com/recaptcha/api.js", "g-recaptcha"),
    "turnstile": ("https://challenges.cloudflare.com/turnstile/v0/siteverify", "cf-turnstile-response",
                  "https://challenges.cloudflare.com/turnstile/v0/api.js", "cf-turnstile"),
}


def client_ip(request):
    if getattr(settings, "TRUST_PROXY", False):
        fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def rate_limited(request, scope, limit, window=3600):
    """True when this IP already made `limit` POSTs to `scope` within `window` seconds."""
    key = f"rl:{scope}:{client_ip(request)}"
    count = cache.get(key, 0)
    if count >= limit:
        return True
    try:
        cache.add(key, 0, window)
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, window)
    return False


def form_token():
    return signing.dumps(time.time(), salt=SALT)


def _token_ok(token):
    try:
        issued = signing.loads(token, salt=SALT, max_age=MAX_FORM_AGE)
    except signing.BadSignature:
        return False
    return time.time() - issued >= MIN_FILL_SECONDS


def captcha_config():
    provider = getattr(settings, "CAPTCHA_PROVIDER", "")
    if provider in CAPTCHA_ENDPOINTS and settings.CAPTCHA_SITE_KEY and settings.CAPTCHA_SECRET_KEY:
        verify_url, field, script, css = CAPTCHA_ENDPOINTS[provider]
        return {"provider": provider, "script": script, "css": css, "site_key": settings.CAPTCHA_SITE_KEY}
    return None


def _captcha_ok(request):
    provider = getattr(settings, "CAPTCHA_PROVIDER", "")
    if not captcha_config():
        return True
    verify_url, field, _s, _c = CAPTCHA_ENDPOINTS[provider]
    response = request.POST.get(field, "")
    if not response:
        return False
    data = urllib.parse.urlencode({"secret": settings.CAPTCHA_SECRET_KEY, "response": response, "remoteip": client_ip(request)}).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(verify_url, data=data), timeout=8) as r:
            return bool(json.load(r).get("success"))
    except Exception:
        log.exception("CAPTCHA verification failed")
        return False


def guard(request, scope, limit):
    """Return an error message (translated) if the POST must be rejected, else None."""
    if not getattr(settings, "FORM_PROTECTION", True):
        return None
    if rate_limited(request, scope, limit):
        return _("Too many requests. Please try again later.")
    if not _token_ok(request.POST.get("form_token", "")):
        return _("The form was submitted too quickly or has expired. Please try again.")
    if not _captcha_ok(request):
        return _("Please complete the verification challenge.")
    return None
