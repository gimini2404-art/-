from django.conf import settings
from django.conf.urls.i18n import i18n_patterns
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.sitemaps.views import sitemap
from django.urls import include, path

from core.api import router as api_router
from core.sitemaps import SITEMAPS
from core.portal import download
from core.views import robots_txt

urlpatterns = [
    path("i18n/", include("django.conf.urls.i18n")),  # language switch (used by the CMS header)
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_router.urls)),
    path("sitemap.xml", sitemap, {"sitemaps": SITEMAPS}, name="sitemap"),
    path("portal-files/<path:name>", download, name="portal_file"),
    path("robots.txt", robots_txt, name="robots"),
] + i18n_patterns(path("", include("core.urls")), prefix_default_language=True)

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
