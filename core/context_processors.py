from django.db.utils import OperationalError, ProgrammingError

from .models import Page, SiteSettings


def site_settings(request):
    try:
        return {
            "site": SiteSettings.load(),
            "menu_pages": Page.objects.filter(is_published=True, show_in_menu=True),
        }
    except (OperationalError, ProgrammingError):  # before first migrate
        return {}
