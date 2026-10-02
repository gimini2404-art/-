from django.contrib import admin
from modeltranslation.admin import TranslationAdmin, TranslationTabularInline

from . import models as m

admin.site.site_header = "SiaNexis CMS"
admin.site.site_title = "SiaNexis CMS"
admin.site.index_title = "Manage website content"


class PlainBase(admin.ModelAdmin):
    save_on_top = True
    list_per_page = 50


class Base(TranslationAdmin):
    save_on_top = True
    list_per_page = 50


class PublishedAdmin(Base):
    list_editable = ("is_published", "order")

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        cls.list_display = tuple(cls.list_display) + ("is_published", "order")


@admin.register(m.SiteSettings)
class SiteSettingsAdmin(Base):
    def has_add_permission(self, request):
        return not m.SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(m.Page)
class PageAdmin(PublishedAdmin):
    list_display = ("title", "slug", "show_in_menu")
    prepopulated_fields = {"slug": ("title",)}
    fieldsets = (
        (None, {"fields": ("title", "slug", "summary", "body", "show_in_menu", "is_published", "order")}),
        ("SEO", {"fields": ("meta_title", "meta_description"), "classes": ("collapse",)}),
    )


@admin.register(m.AboutSection)
class AboutSectionAdmin(PublishedAdmin):
    list_display = ("title", "kind")
    list_filter = ("kind",)


@admin.register(m.TeamMember)
class TeamMemberAdmin(PublishedAdmin):
    list_display = ("name", "role", "group")
    list_filter = ("group",)
    search_fields = ("name", "role")


@admin.register(m.ResearchArea)
class ResearchAreaAdmin(PublishedAdmin):
    list_display = ("title",)
    prepopulated_fields = {"slug": ("title",)}


class ServiceInline(TranslationTabularInline):
    model = m.Service
    extra = 1


@admin.register(m.ServiceCategory)
class ServiceCategoryAdmin(PublishedAdmin):
    list_display = ("title",)
    inlines = [ServiceInline]
    prepopulated_fields = {"slug": ("title",)}


@admin.register(m.Service)
class ServiceAdmin(PublishedAdmin):
    list_display = ("title", "category")
    list_filter = ("category",)


@admin.register(m.Organization)
class OrganizationAdmin(Base):
    list_display = ("name", "country")
    search_fields = ("name",)


@admin.register(m.Collaboration)
class CollaborationAdmin(PublishedAdmin):
    list_display = ("organization_name", "country", "collaboration_type")
    list_filter = ("collaboration_type", "country")
    search_fields = ("organization_name",)


class PublicationInline(TranslationTabularInline):
    model = m.Publication
    extra = 0
    fields = ("kind", "title", "authors", "year", "doi")


@admin.register(m.Project)
class ProjectAdmin(PublishedAdmin):
    list_display = ("title", "research_area", "status", "featured")
    list_filter = ("status", "research_area", "featured")
    search_fields = ("title",)
    filter_horizontal = ("institutions",)
    prepopulated_fields = {"slug": ("title",)}
    inlines = [PublicationInline]
    fieldsets = (
        (None, {"fields": ("title", "slug", "research_area", "status", "featured", "image")}),
        ("Details", {"fields": ("problem", "role", "methodology", "outcome", "institutions")}),
        ("Publishing", {"fields": ("is_published", "order")}),
        ("SEO", {"fields": ("meta_title", "meta_description"), "classes": ("collapse",)}),
    )


@admin.register(m.Publication)
class PublicationAdmin(PublishedAdmin):
    list_display = ("title", "kind", "year", "journal")
    list_filter = ("kind", "year")
    search_fields = ("title", "authors", "journal", "doi")


@admin.register(m.HubItem)
class HubItemAdmin(PublishedAdmin):
    list_display = ("title", "category", "status", "research_area")
    list_filter = ("category", "status", "research_area")
    search_fields = ("title", "summary")
    prepopulated_fields = {"slug": ("title",)}


@admin.register(m.TrainingProgram)
class TrainingAdmin(PublishedAdmin):
    list_display = ("title", "kind", "start_date")
    list_filter = ("kind",)
    prepopulated_fields = {"slug": ("title",)}


@admin.register(m.Opportunity)
class OpportunityAdmin(PublishedAdmin):
    list_display = ("title", "kind", "deadline")
    list_filter = ("kind",)
    prepopulated_fields = {"slug": ("title",)}


@admin.register(m.ContactRequest)
class ContactRequestAdmin(PlainBase):
    list_display = ("created", "request_type", "name", "email", "organization", "status", "email_sent")
    list_filter = ("status", "request_type", "email_sent")
    list_editable = ("status",)
    search_fields = ("name", "email", "organization", "message")
    readonly_fields = ("created", "email_sent")
    date_hierarchy = "created"
    actions = ["export_csv"]

    @admin.action(description="Export selected requests as CSV")
    def export_csv(self, request, queryset):
        import csv

        from django.http import HttpResponse

        resp = HttpResponse(content_type="text/csv")
        resp["Content-Disposition"] = 'attachment; filename="requests.csv"'
        w = csv.writer(resp)
        w.writerow(["created", "type", "name", "email", "organization", "subject", "message", "status"])
        for r in queryset:
            w.writerow([r.created, r.get_request_type_display(), r.name, r.email, r.organization, r.subject, r.message, r.status])
        return resp
