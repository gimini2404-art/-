from django.apps import AppConfig
from django.contrib.admin.apps import AdminConfig
from django.utils.translation import gettext_lazy as _


class CoreConfig(AppConfig):
    name = "core"
    verbose_name = _("Website content")
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from . import firebase

        firebase.connect_signals()


class SiaNexisAdminConfig(AdminConfig):
    default_site = "core.admin_site.SiaNexisAdminSite"
