import logging

from django.conf import settings
from django.core.mail import send_mail
from django.utils.translation import gettext as _

log = logging.getLogger(__name__)


def send_safe(subject, body, to):
    """Send an email; never raise (the data is already saved in the CMS). Returns True on success."""
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to] if isinstance(to, str) else list(to), fail_silently=False)
        return True
    except Exception:
        log.exception("Email to %s failed", to)
        return False


def contact_confirmation(obj):
    """Auto-reply to the person who sent a contact request (active language)."""
    return send_safe(
        _("We received your request - SiaNexis"),
        _("Dear %(name)s,") % {"name": obj.name} + "\n\n"
        + _("Thank you for contacting SiaNexis. We have received your request and a member of our team will reply soon.") + "\n\n"
        + _("Your message:") + "\n" + obj.message + "\n\n" + _("Best regards,") + "\nSiaNexis",
        obj.email,
    )


def registration_confirmation(reg):
    status_line = {
        "waitlist": _("The program is currently full, so you have been added to the waiting list. We will contact you if a seat becomes available."),
    }.get(reg.status, _("Your registration was received. We will confirm your seat by email."))
    return send_safe(
        _("Training registration - %(program)s") % {"program": reg.program.title},
        _("Dear %(name)s,") % {"name": reg.name} + "\n\n" + status_line + "\n\n"
        + _("Program:") + " " + reg.program.title + "\n\n" + _("Best regards,") + "\nSiaNexis",
        reg.email,
    )
