from django.db.utils import OperationalError, ProgrammingError

from .models import Page, SiteSettings
from .security import captcha_config


def site_settings(request):
    try:
        return {
            "site": SiteSettings.load(),
            "menu_pages": Page.objects.filter(is_published=True, show_in_menu=True),
            "captcha": captcha_config(),
        }
    except (OperationalError, ProgrammingError):  # before first migrate
        return {}
