from django.contrib.sitemaps import Sitemap
from django.urls import reverse

from .models import HubItem, Page, Project, ResearchArea


class StaticSitemap(Sitemap):
    priority = 0.8

    def items(self):
        return ["home", "about", "research_areas", "services", "hub", "collaborations", "projects",
                "publications", "training", "opportunities", "contact"]

    def location(self, item):
        return reverse(item)


def model_sitemap(model):
    class _S(Sitemap):
        priority = 0.6

        def items(self):
            return model.objects.filter(is_published=True)

        def lastmod(self, obj):
            return obj.updated
    return _S


SITEMAPS = {
    "static": StaticSitemap,
    "areas": model_sitemap(ResearchArea),
    "projects": model_sitemap(Project),
    "hub": model_sitemap(HubItem),
    "pages": model_sitemap(Page),
}
