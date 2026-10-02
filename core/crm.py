"""Push leads (contact requests, registrations, subscribers) to a CRM.

Two options, both optional and configured with environment variables:
  CRM_WEBHOOK_URL (+ CRM_WEBHOOK_SECRET)  generic JSON webhook - works with Zapier, Make, n8n, Odoo, Zoho Flow...
  HUBSPOT_TOKEN                           HubSpot private-app token - creates/updates a contact directly
"""
import hashlib
import hmac
import json
import logging
import threading
import time
import urllib.error
import urllib.request

from django.conf import settings

log = logging.getLogger(__name__)


def enabled():
    return bool(settings.CRM_WEBHOOK_URL or settings.HUBSPOT_TOKEN)


def _post(url, payload, headers):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status


def _send(kind, data):
    ok = True
    if settings.CRM_WEBHOOK_URL:
        body = {"event": kind, "sent_at": int(time.time()), "data": data}
        headers = {}
        if settings.CRM_WEBHOOK_SECRET:
            sig = hmac.new(settings.CRM_WEBHOOK_SECRET.encode(), json.dumps(body).encode(), hashlib.sha256).hexdigest()
            headers["X-SiaNexis-Signature"] = sig
        try:
            _post(settings.CRM_WEBHOOK_URL, body, headers)
        except Exception:
            log.exception("CRM webhook failed")
            ok = False
    if settings.HUBSPOT_TOKEN and data.get("email"):
        parts = (data.get("name") or "").split(" ", 1)
        props = {"email": data["email"], "firstname": parts[0], "lastname": parts[1] if len(parts) > 1 else "",
                 "company": data.get("organization", ""), "message": data.get("message", "")[:500]}
        try:
            _post("https://api.hubapi.com/crm/v3/objects/contacts", {"properties": props},
                  {"Authorization": f"Bearer {settings.HUBSPOT_TOKEN}"})
        except urllib.error.HTTPError as e:
            if e.code != 409:  # 409 = contact already exists, which is fine
                log.exception("HubSpot push failed")
                ok = False
        except Exception:
            log.exception("HubSpot push failed")
            ok = False
    return ok


def push(kind, instance, data):
    """Send in the background and record the outcome in instance.crm_status (ok / failed)."""
    if not enabled():
        return

    def run():
        status = "ok" if _send(kind, data) else "failed"
        type(instance).objects.filter(pk=instance.pk).update(crm_status=status)

    if getattr(settings, "CRM_ASYNC", True):
        threading.Thread(target=run, daemon=True).start()
    else:
        run()
