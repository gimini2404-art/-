from modeltranslation.translator import TranslationOptions, register

from . import models as m


@register(m.SiteSettings)
class SiteSettingsTR(TranslationOptions):
    fields = ("site_name", "tagline", "hero_title", "hero_text", "intro_text", "cta_title", "cta_text",
              "address", "footer_text", "default_meta_description")


@register(m.Page)
class PageTR(TranslationOptions):
    fields = ("title", "summary", "body", "meta_title", "meta_description")


@register(m.AboutSection)
class AboutSectionTR(TranslationOptions):
    fields = ("title", "body")


@register(m.TeamMember)
class TeamMemberTR(TranslationOptions):
    fields = ("name", "role", "affiliation", "bio")


@register(m.ResearchArea)
class ResearchAreaTR(TranslationOptions):
    fields = ("title", "summary", "description", "meta_title", "meta_description")


@register(m.ServiceCategory)
class ServiceCategoryTR(TranslationOptions):
    fields = ("title", "description")


@register(m.Service)
class ServiceTR(TranslationOptions):
    fields = ("title", "description")


@register(m.Organization)
class OrganizationTR(TranslationOptions):
    fields = ("name", "country")


@register(m.Collaboration)
class CollaborationTR(TranslationOptions):
    fields = ("organization_name", "country", "description")


@register(m.Project)
class ProjectTR(TranslationOptions):
    fields = ("title", "problem", "role", "methodology", "outcome", "meta_title", "meta_description")


@register(m.Publication)
class PublicationTR(TranslationOptions):
    fields = ("title",)


@register(m.HubItem)
class HubItemTR(TranslationOptions):
    fields = ("title", "summary", "description", "meta_title", "meta_description")


@register(m.TrainingProgram)
class TrainingTR(TranslationOptions):
    fields = ("title", "summary", "description", "duration", "format")


@register(m.Opportunity)
class OpportunityTR(TranslationOptions):
    fields = ("title", "summary", "description")


@register(m.Post)
class PostTR(TranslationOptions):
    fields = ("title", "summary", "body", "meta_title", "meta_description")
