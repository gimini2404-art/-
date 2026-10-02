from django.contrib.sitemaps import Sitemap
from django.urls import reverse

from .models import HubItem, Page, Post, Project, ResearchArea, TeamMember, live_filter


class StaticSitemap(Sitemap):
    priority = 0.8
    i18n = True
    alternates = True
    x_default = True

    def items(self):
        return ["home", "about", "research_areas", "services", "hub", "collaborations", "projects",
                "publications", "training", "opportunities", "posts", "contact"]

    def location(self, item):
        return reverse(item)


def model_sitemap(model):
    class _S(Sitemap):
        priority = 0.6
        i18n = True
        alternates = True
        x_default = True

        def items(self):
            return model.objects.filter(live_filter())

        def lastmod(self, obj):
            return obj.updated
    return _S


def article_sitemap():
    from .models import Publication

    class _A(Sitemap):
        priority = 0.7
        i18n = True
        alternates = True
        x_default = True

        def items(self):
            return [p for p in Publication.objects.filter(live_filter()).exclude(slug__isnull=True) if p.has_article]

        def lastmod(self, obj):
            return obj.updated
    return _A


SITEMAPS = {
    "static": StaticSitemap,
    "areas": model_sitemap(ResearchArea),
    "projects": model_sitemap(Project),
    "hub": model_sitemap(HubItem),
    "pages": model_sitemap(Page),
    "posts": model_sitemap(Post),
    "team": model_sitemap(TeamMember),
    "articles": article_sitemap(),
}
