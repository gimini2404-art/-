from django.db.utils import OperationalError, ProgrammingError

from .models import Page, SiteSettings
from .security import captcha_config


def site_settings(request):
    try:
        unread = request.user.notifications.filter(read=False).count() if getattr(request, "user", None) and request.user.is_authenticated else 0
        return {
            "unread_count": unread,
            "site": SiteSettings.load(),
            "menu_pages": Page.objects.filter(is_published=True, show_in_menu=True),
            "captcha": captcha_config(),
        }
    except (OperationalError, ProgrammingError):  # before first migrate
        return {}
