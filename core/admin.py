from django.contrib import admin, messages
from django.utils.translation import gettext_lazy as _
from modeltranslation.admin import TranslationAdmin, TranslationTabularInline

from . import models as m

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
        (_("SEO"), {"fields": ("meta_title", "meta_description"), "classes": ("collapse",)}),
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
        (_("Details"), {"fields": ("problem", "role", "methodology", "outcome", "institutions")}),
        (_("Publishing"), {"fields": ("is_published", "order")}),
        (_("SEO"), {"fields": ("meta_title", "meta_description"), "classes": ("collapse",)}),
    )


@admin.register(m.Publication)
class PublicationAdmin(PublishedAdmin):
    list_display = ("title", "kind", "year", "journal")
    list_filter = ("kind", "year")
    search_fields = ("title", "authors", "journal", "doi")
    actions = ["fetch_from_crossref"]

    @admin.action(description=_("Fill missing details from DOI (Crossref)"))
    def fetch_from_crossref(self, request, queryset):
        import json
        import urllib.request

        done = 0
        for pub in queryset.exclude(doi=""):
            try:
                req = urllib.request.Request(f"https://api.crossref.org/works/{pub.doi}", headers={"User-Agent": "SiaNexis-CMS/1.0"})
                data = json.load(urllib.request.urlopen(req, timeout=10))["message"]
            except Exception as exc:
                self.message_user(request, f"{pub.doi}: could not fetch ({exc})", messages.WARNING)
                continue
            authors = ", ".join(f"{a.get('given', '')} {a.get('family', '')}".strip() for a in data.get("author", []))
            if not pub.title_en and data.get("title"):
                pub.title_en = data["title"][0]
            if not pub.authors and authors:
                pub.authors = authors
            if not pub.journal and data.get("container-title"):
                pub.journal = data["container-title"][0]
            if not pub.year:
                parts = (data.get("issued", {}).get("date-parts") or [[None]])[0]
                pub.year = parts[0]
            pub.save()
            done += 1
        self.message_user(request, _("Updated %(n)s publication(s) from Crossref.") % {"n": done})


@admin.register(m.HubItem)
class HubItemAdmin(PublishedAdmin):
    list_display = ("title", "category", "status", "research_area")
    list_filter = ("category", "status", "research_area")
    search_fields = ("title", "summary")
    prepopulated_fields = {"slug": ("title",)}


@admin.register(m.TrainingProgram)
class TrainingAdmin(PublishedAdmin):
    list_display = ("title", "kind", "start_date", "seats")

    @admin.display(description=_("Seats (taken / capacity)"))
    def seats(self, obj):
        return f"{obj.seats_taken} / {obj.capacity if obj.capacity is not None else '∞'}"

    list_filter = ("kind",)
    prepopulated_fields = {"slug": ("title",)}


@admin.register(m.Opportunity)
class OpportunityAdmin(PublishedAdmin):
    list_display = ("title", "kind", "deadline")
    list_filter = ("kind",)
    prepopulated_fields = {"slug": ("title",)}


def _csv(filename, header, rows):
    import csv

    from django.http import HttpResponse

    resp = HttpResponse(content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    resp.write("\ufeff")  # BOM so Excel reads Arabic correctly
    w = csv.writer(resp)
    w.writerow(header)
    w.writerows(rows)
    return resp


@admin.register(m.ContactRequest)
class ContactRequestAdmin(PlainBase):
    list_display = ("created", "request_type", "name", "email", "organization", "status", "assigned_to", "email_sent", "confirmation_sent")
    list_filter = ("status", "request_type", "assigned_to", "email_sent")
    list_editable = ("status", "assigned_to")
    search_fields = ("name", "email", "organization", "message")
    readonly_fields = ("created", "email_sent", "confirmation_sent", "language")
    date_hierarchy = "created"
    actions = ["assign_to_me", "mark_in_progress", "mark_closed", "export_csv"]

    def save_model(self, request, obj, form, change):
        notify = change and "assigned_to" in form.changed_data and obj.assigned_to and obj.assigned_to.email
        super().save_model(request, obj, form, change)
        if notify:
            from .emails import send_safe
            send_safe(f"[SiaNexis] Request assigned to you: {obj.get_request_type_display()} - {obj.name}",
                      f"{obj.name} <{obj.email}>\n{obj.organization}\n\n{obj.message}\n\n"
                      f"Open: {request.build_absolute_uri(request.path)}", obj.assigned_to.email)

    @admin.action(description=_("Assign selected to me"))
    def assign_to_me(self, request, queryset):
        self.message_user(request, _("%(n)s request(s) assigned to you.") % {"n": queryset.update(assigned_to=request.user)})

    @admin.action(description=_("Mark as in progress"))
    def mark_in_progress(self, request, queryset):
        queryset.update(status="in_progress")

    @admin.action(description=_("Mark as closed"))
    def mark_closed(self, request, queryset):
        queryset.update(status="closed")

    @admin.action(description=_("Export selected requests as CSV"))
    def export_csv(self, request, queryset):
        return _csv("requests.csv", ["created", "type", "name", "email", "organization", "subject", "message", "status", "assigned_to"],
                    [[r.created, r.get_request_type_display(), r.name, r.email, r.organization, r.subject, r.message, r.status, r.assigned_to] for r in queryset])


@admin.register(m.Post)
class PostAdmin(PublishedAdmin):
    list_display = ("title", "published_at")
    prepopulated_fields = {"slug": ("title",)}
    date_hierarchy = "published_at"
    search_fields = ("title", "summary")
    fieldsets = (
        (None, {"fields": ("title", "slug", "summary", "body", "image", "author_name", "published_at", "is_published", "order")}),
        (_("SEO"), {"fields": ("meta_title", "meta_description"), "classes": ("collapse",)}),
    )


@admin.register(m.NewsletterSubscriber)
class SubscriberAdmin(PlainBase):
    list_display = ("email", "language", "is_active", "created")
    list_filter = ("is_active", "language")
    search_fields = ("email",)
    list_editable = ("is_active",)
    actions = ["export_csv"]

    @admin.action(description=_("Export selected subscribers as CSV"))
    def export_csv(self, request, queryset):
        return _csv("subscribers.csv", ["email", "language", "active", "created"],
                    [[x.email, x.language, x.is_active, x.created] for x in queryset])


@admin.register(m.TrainingRegistration)
class RegistrationAdmin(PlainBase):
    list_display = ("created", "name", "email", "program", "status")
    list_filter = ("status", "program")
    list_editable = ("status",)
    search_fields = ("name", "email", "organization")
    readonly_fields = ("created", "language")
    date_hierarchy = "created"
    actions = ["confirm", "export_csv"]

    @admin.action(description=_("Confirm selected registrations"))
    def confirm(self, request, queryset):
        self.message_user(request, _("%(n)s registration(s) confirmed.") % {"n": queryset.update(status="confirmed")})

    @admin.action(description=_("Export selected registrations as CSV"))
    def export_csv(self, request, queryset):
        return _csv("registrations.csv", ["created", "program", "name", "email", "organization", "phone", "status", "notes"],
                    [[r.created, r.program, r.name, r.email, r.organization, r.phone, r.status, r.message] for r in queryset])
