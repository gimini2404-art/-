import logging
import re

from django.contrib import admin, messages
from django.utils.translation import gettext_lazy as _
from modeltranslation.admin import TranslationAdmin, TranslationTabularInline
from reversion.admin import VersionAdmin
from django.utils.html import format_html

from . import models as m

log = logging.getLogger(__name__)


def easy(model, main, more, seo=False):
    """Simple forms: the essentials first (English), the Arabic version and everything else folded away."""
    from modeltranslation.translator import translator

    try:
        tr = set(translator.get_options_for_model(model).get_field_names())
    except Exception:
        tr = set()
    en = tuple(f"{f}_en" if f in tr else f for f in main)
    ar = tuple(f"{f}_ar" for f in main if f in tr)
    fs = [(_("Main information"), {"fields": en})]
    if ar:
        fs.append((_("Arabic version (optional)"), {"fields": ar, "classes": ("collapse",),
                                                     "description": _("Leave empty to show the English text on the Arabic pages.")}))
    fs.append((_("More options (optional)"), {"fields": more, "classes": ("collapse",)}))
    if seo:
        fs.append((_("SEO"), {"fields": ("meta_title", "meta_description"), "classes": ("collapse",)}))
    return tuple(fs)


class PlainBase(VersionAdmin):
    save_on_top = True
    list_per_page = 50


class Base(VersionAdmin, TranslationAdmin):
    save_on_top = True
    list_per_page = 50


class PublishedAdmin(Base):
    list_editable = ("is_published", "order")

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        cls.list_display = tuple(cls.list_display) + ("visibility", "is_published", "order")
        own = tuple(cls.__dict__.get("actions", ()))
        cls.actions = own + tuple(a for a in ("publish_now", "unpublish") if a not in own)

    @admin.display(description=_("Visibility"))
    def visibility(self, obj):
        colors = {"live": ("#14705a", _("Live")), "scheduled": ("#9a6700", _("Scheduled")),
                  "expired": ("#6b7c88", _("Expired")), "draft": ("#b3261e", _("Draft"))}
        color, label = colors[obj.state]
        return format_html('<span style="background:{};color:#fff;border-radius:999px;padding:2px 10px;font-size:.78rem;font-weight:600">{}</span>', color, label)

    @admin.action(description=_("Publish selected (make live now)"))
    def publish_now(self, request, queryset):
        self.message_user(request, _("%(n)s item(s) published.") % {"n": queryset.update(is_published=True, publish_at=None, unpublish_at=None)})

    @admin.action(description=_("Unpublish selected (draft)"))
    def unpublish(self, request, queryset):
        self.message_user(request, _("%(n)s item(s) moved to draft.") % {"n": queryset.update(is_published=False)})


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
        (None, {"fields": ("title", "slug", "summary", "body", "show_in_menu", "is_published", "publish_at", "unpublish_at", "order")}),
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
    search_fields = ("name", "role", "orcid")
    filter_horizontal = ("publications",)
    prepopulated_fields = {"slug": ("name",)}
    fieldsets = easy(m.TeamMember, ("name", "role", "group", "photo", "bio", "is_published"), ("slug", "affiliation", "orcid", "google_scholar_url", "profile_url", "publications", "publish_at", "unpublish_at", "order"))


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
    list_display = ("name", "country", "is_partner")
    list_editable = ("is_partner",)
    search_fields = ("name",)


@admin.register(m.Collaboration)
class CollaborationAdmin(PublishedAdmin):
    list_display = ("organization_name", "country", "collaboration_type", "on_map")
    actions = ["fill_coordinates"]

    @admin.display(description=_("On map"), boolean=True)
    def on_map(self, obj):
        return obj.latitude is not None and obj.longitude is not None

    @admin.action(description=_("Fill coordinates from country"))
    def fill_coordinates(self, request, queryset):
        from .geo import locate

        done = 0
        for c in queryset.filter(latitude__isnull=True):
            pos = locate(c.country_en or c.country) or locate(c.country_ar or "")
            if pos:
                c.latitude, c.longitude = pos
                c.save(update_fields=["latitude", "longitude"])
                done += 1
        self.message_user(request, _("%(n)s collaboration(s) placed on the map.") % {"n": done})

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
    fieldsets = easy(m.Project, ("title", "research_area", "status", "problem", "outcome", "image", "is_published"), ("slug", "role", "methodology", "institutions", "featured", "publish_at", "unpublish_at", "order"), seo=True)


class AuthorInline(admin.TabularInline):
    model = m.ArticleAuthor
    extra = 0
    fields = ("order", "name", "given_name", "family_name", "affiliation", "corresponding", "email", "orcid")


class SectionInline(admin.StackedInline):
    model = m.ArticleSection
    extra = 0
    fields = ("kind", "heading", "order", "body")
    classes = ("collapse",)


class FigureInline(admin.StackedInline):
    model = m.ArticleFigure
    extra = 0
    fields = (("kind", "number", "label"), "caption", "image", "table_html", "note")
    classes = ("collapse",)


class ReferenceInline(admin.TabularInline):
    model = m.ArticleReference
    extra = 0
    fields = ("number", "text", "authors", "title", "source", "doi", "url")
    classes = ("collapse",)


class ArticleLinkInline(admin.TabularInline):
    model = m.ArticleLink
    extra = 0
    classes = ("collapse",)


@admin.register(m.Publication)
class PublicationAdmin(PublishedAdmin):
    inlines = [AuthorInline, SectionInline, FigureInline, ReferenceInline, ArticleLinkInline]
    prepopulated_fields = {"slug": ("title",)}
    fieldsets = (
        (_("Visibility"), {"fields": ("is_published",)}),
        (_("Publication"), {"fields": ("kind", "title", "authors", "journal", "year", "doi", "external_link", "pdf", "related_project")}),
        (_("Article page"), {"fields": ("slug", "content_type", "open_access", ("published_date", "received_date", "accepted_date"),
                                         ("volume", "issue", "article_number"), ("publisher", "issn"), ("license", "license_url")),
                             "classes": ("collapse",)}),
        (_("Abstract and content"), {"fields": ("abstract", "abstract_background", "abstract_methods", "abstract_results", "abstract_conclusion",
                                                "keywords", "subjects", "rights_text"), "classes": ("collapse",)}),
        (_("Metrics"), {"fields": (("accesses", "citations", "altmetric", "mentions"),), "classes": ("collapse",)}),
        (_("Schedule and order (optional)"), {"fields": ("publish_at", "unpublish_at", "order"), "classes": ("collapse",)}),
    )
    list_display = ("title", "kind", "year", "journal", "has_article_page")

    @admin.display(description=_("Article page"), boolean=True)
    def has_article_page(self, obj):
        return obj.has_article

    list_filter = ("kind", "year")
    search_fields = ("title", "authors", "journal", "doi")
    actions = ["fetch_from_crossref"]
    change_list_template = "admin/core/publication/change_list.html"

    def get_urls(self):
        from django.urls import path

        return [path("import/", self.admin_site.admin_view(self.import_view), name="core_publication_import"),
                path("import-article/", self.admin_site.admin_view(self.import_article_view), name="core_publication_import_article"),
                path("import-done/<int:pk>/", self.admin_site.admin_view(self.import_done_view), name="core_publication_import_done"),
                path("add-by-doi/", self.admin_site.admin_view(self.add_by_doi_view), name="core_publication_add_by_doi")] + super().get_urls()

    # ---- one-step paper import: PDF -> (publish now | draft) -> result page with undo -------------------------------
    IMPORT_TMP = "import_tmp"

    def _tmp_dir(self):
        import time
        from pathlib import Path

        from django.conf import settings

        d = Path(settings.MEDIA_ROOT) / self.IMPORT_TMP
        d.mkdir(parents=True, exist_ok=True)
        for old in d.glob("*.pdf"):  # tidy up abandoned uploads
            if time.time() - old.stat().st_mtime > 6 * 3600:
                old.unlink(missing_ok=True)
        return d

    def _import_texts(self):
        return {
            "no_abstract": _("No abstract was detected."), "no_references": _("No references were detected."), "no_sections": _("No body sections were detected."),
            "figure_count_mismatch": _("The number of images does not match the number of figure captions. Check the figures."),
            "images_failed": _("Images could not be extracted. Add figures manually."), "no_doi": _("No DOI was found. You can add it by editing the paper."),
            "crossref_unreachable": _("Crossref could not be reached; details come from the PDF only."), "no_title": _("No title was detected: please type it."),
            "no_authors": _("No authors were detected: add them in the Authors section."),
        }

    def import_article_view(self, request):
        """Step 1: choose a PDF and press 'Publish now' or 'Save as draft'. Everything else is automatic."""
        import uuid

        from django.shortcuts import redirect, render
        from django.urls import reverse
        from django.utils.html import format_html

        from . import crossref
        from .article_import import save_article
        from .pdf_extract import PdfProblem, extract

        tmp = self._tmp_dir()
        ctx = {**self.admin_site.each_context(request), "title": _("Add a research paper"), "opts": self.model._meta}
        page = "admin/core/publication/import_article.html"
        if request.method != "POST":
            import importlib.util

            missing = [n for n in ("pdfminer", "pypdf") if importlib.util.find_spec(n) is None]
            if missing:
                self.message_user(request, _("Missing components: %(m)s. On the computer running the site run:  pip install -r requirements.txt  then restart the server.") % {"m": ", ".join(missing)}, messages.ERROR)
            return render(request, page, ctx)

        publish = request.POST.get("action") != "draft"
        token = request.POST.get("token", "")
        if token:  # second step after a duplicate warning
            f = tmp / f"{token}.pdf"
            if not re.fullmatch(r"[0-9a-f]{32}", token) or not f.exists():
                self.message_user(request, _("The upload expired. Please choose the PDF again."), messages.ERROR)
                return render(request, page, ctx)
            raw = f.read_bytes()
            if request.POST.get("cancel"):
                f.unlink(missing_ok=True)
                return redirect("admin:core_publication_changelist")
            replace = True
        else:
            up = request.FILES.get("pdf")
            if not up or not up.name.lower().endswith(".pdf"):
                self.message_user(request, _("Please choose a PDF file."), messages.ERROR)
                return render(request, page, ctx)
            raw = up.read()
            replace = False
        if not raw.startswith(b"%PDF") or len(raw) > 40 * 1024 * 1024:
            self.message_user(request, _("The file is not a valid PDF or is larger than 40 MB."), messages.ERROR)
            return render(request, page, ctx)
        try:
            res = extract(raw)
        except ImportError as exc:
            log.exception("PDF libraries missing")
            self.message_user(request, _("A required component is missing (%(name)s). On the computer running the site, run:  pip install -r requirements.txt  then restart the server.") % {"name": getattr(exc, "name", "") or "pdfminer.six"}, messages.ERROR)
            return render(request, page, ctx)
        except PdfProblem as exc:
            self.message_user(request, _("This PDF is password-protected. Remove the password and try again.") if str(exc) == "encrypted" else _("This PDF cannot be processed."), messages.ERROR)
            return render(request, page, ctx)
        except Exception as exc:
            log.exception("PDF import failed")
            self.message_user(request, _("The PDF could not be read (%(err)s). Try another file, or run: python manage.py check_pdf <file>  to see the details.") % {"err": f"{type(exc).__name__}: {str(exc)[:120]}"}, messages.ERROR)
            return render(request, page, ctx)
        if "no_text" in res.warnings:
            self.message_user(request, _("This PDF has no selectable text (it looks scanned). Use a text PDF or add the article manually."), messages.ERROR)
            return render(request, page, ctx)
        data = res.data
        doi = (request.POST.get("doi", "").strip() or data.get("doi", "")).replace("https://doi.org/", "")
        data["doi"] = doi
        warnings = list(res.warnings)
        cr = crossref.fetch(doi) if doi else None   # automatic; silently skipped when offline
        if cr:
            crossref.apply(data, cr)
        else:
            warnings.append("crossref_unreachable" if doi else "no_doi")
        if not data.get("title"):
            data["title"] = (request.FILES["pdf"].name if request.FILES.get("pdf") else "Untitled").rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip().title()
            warnings.append("no_title")
        if not data.get("authors_detail"):
            warnings.append("no_authors")
        existing = m.Publication.objects.filter(doi=doi).first() if doi else None
        if existing and not replace:
            token = uuid.uuid4().hex
            (tmp / f"{token}.pdf").write_bytes(raw)
            ctx.update(conflict=existing, token=token, action="publish" if publish else "draft")
            return render(request, "admin/core/publication/import_conflict.html", ctx)
        images = {i["number"]: i["bytes"] for i in res.images}
        pub = save_article(data, pdf_bytes=raw, images=images, publish=publish, existing=existing)
        if token:
            (tmp / f"{token}.pdf").unlink(missing_ok=True)
        texts = self._import_texts()
        notes = [str(texts[w]) for w in warnings if w in texts]
        notes += [str(_("Table %(n)s could not be rebuilt automatically: add it under Figures & tables.") % {"n": w.split("_")[1]})
                  for w in warnings if w.startswith("table_") and w.endswith("_needs_manual_entry")]
        request.session[f"import_notes_{pub.pk}"] = notes
        return redirect("admin:core_publication_import_done", pub.pk)

    def import_done_view(self, request, pk):
        """Result page: big View / Edit buttons and a one-click Publish / Undo."""
        from django.shortcuts import get_object_or_404, redirect, render

        pub = get_object_or_404(m.Publication, pk=pk)
        if request.method == "POST":
            act = request.POST.get("do")
            if act == "publish":
                pub.is_published, pub.publish_at, pub.unpublish_at = True, None, None
                pub.save()
            elif act == "unpublish":
                pub.is_published = False
                pub.save()
            return redirect("admin:core_publication_import_done", pub.pk)
        ctx = {**self.admin_site.each_context(request), "title": _("Your paper"), "opts": self.model._meta, "pub": pub,
               "notes": request.session.get(f"import_notes_{pub.pk}", []), "counts": {
                   "sections": pub.sections.count(), "refs": pub.references.count(), "figs": pub.figures.count(), "authors": pub.author_list.count()}}
        return render(request, "admin/core/publication/import_done.html", ctx)

    def add_by_doi_view(self, request):
        """Add one or more papers to the publications list from their DOIs (details come from Crossref)."""
        from django.shortcuts import redirect

        from . import crossref

        added, failed = 0, []
        for doi in re.findall(r"10\.\d{4,9}/[^\s,;]+", request.POST.get("dois", "")):
            doi = doi.rstrip(".")
            if m.Publication.objects.filter(doi=doi).exists():
                continue
            cr = crossref.fetch(doi)
            if not cr or not cr.get("title"):
                failed.append(doi)
                continue
            data = {"doi": doi, "title": cr["title"][0], "authors_detail": [], "sections": [], "references": [], "figures": [], "links": []}
            crossref.apply(data, cr)
            pub = m.Publication(doi=doi, kind="paper", title_en=data["title"], authors=data.get("authors", ""), journal=data.get("journal", ""),
                                year=data.get("year"), volume=data.get("volume", ""), external_link=f"https://doi.org/{doi}")
            pub.save()
            added += 1
        if added:
            self.message_user(request, _("%(n)s paper(s) added to the publications list.") % {"n": added})
        for doi in failed:
            self.message_user(request, _("Could not fetch %(doi)s (check the DOI and the internet connection).") % {"doi": doi}, messages.WARNING)
        if not added and not failed:
            self.message_user(request, _("Paste at least one DOI, for example 10.1186/s12910-024-01078-0."), messages.WARNING)
        return redirect("admin:core_publication_changelist" if added else "admin:core_publication_import_article")

    def import_view(self, request):
        """Temporary import session: upload -> preview (kept only in the session) -> confirm or discard."""
        from django.shortcuts import redirect, render

        from .importers import norm_title, parse_auto

        key = "pub_import"
        ctx = {**self.admin_site.each_context(request), "title": _("Import publications"), "opts": self.model._meta,
               "kinds": m.Publication.KINDS, "items": None, "dupes": 0}
        step = request.POST.get("step")
        if request.method == "POST" and step == "discard":
            request.session.pop(key, None)
            self.message_user(request, _("Import session closed. Nothing was saved."))
            return redirect("admin:core_publication_changelist")
        if request.method == "POST" and step == "parse":
            raw = request.FILES["file"].read().decode("utf-8", "replace") if request.FILES.get("file") else request.POST.get("text", "")
            items = parse_auto(raw)
            if not items:
                self.message_user(request, _("No publications could be read from that input."), messages.WARNING)
                return render(request, "admin/core/publication/import.html", ctx)
            existing_doi = {d.lower() for d in m.Publication.objects.exclude(doi="").values_list("doi", flat=True)}
            existing_titles = {norm_title(t) for t in m.Publication.objects.values_list("title_en", flat=True)}
            for it in items:
                it["duplicate"] = bool((it["doi"] and it["doi"].lower() in existing_doi) or norm_title(it["title"]) in existing_titles)
            request.session[key] = items
            ctx.update(items=items, dupes=sum(i["duplicate"] for i in items))
            return render(request, "admin/core/publication/import.html", ctx)
        if request.method == "POST" and step == "confirm":
            items = request.session.pop(key, [])
            created = 0
            for idx in request.POST.getlist("pick"):
                if idx.isdigit() and int(idx) < len(items):
                    it = items[int(idx)]
                    kind = request.POST.get(f"kind_{idx}", it["kind"])
                    m.Publication.objects.create(
                        title_en=it["title"], authors=it["authors"], journal=it["journal"], year=it["year"], doi=it["doi"],
                        external_link=it["link"], kind=kind if kind in dict(m.Publication.KINDS) else "paper")
                    created += 1
            self.message_user(request, _("%(n)s publication(s) imported.") % {"n": created})
            return redirect("admin:core_publication_changelist")
        request.session.pop(key, None)
        return render(request, "admin/core/publication/import.html", ctx)

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
    fieldsets = easy(m.HubItem, ("title", "category", "summary", "description", "status", "image", "link", "is_published"), ("slug", "research_area", "related_project", "publish_at", "unpublish_at", "order"), seo=True)


@admin.register(m.TrainingProgram)
class TrainingAdmin(PublishedAdmin):
    list_display = ("title", "kind", "start_date", "seats")

    @admin.display(description=_("Seats (taken / capacity)"))
    def seats(self, obj):
        return f"{obj.seats_taken} / {obj.capacity if obj.capacity is not None else '∞'}"

    list_filter = ("kind",)
    prepopulated_fields = {"slug": ("title",)}
    fieldsets = easy(m.TrainingProgram, ("title", "kind", "summary", "description", "start_date", "duration", "format", "registration_open", "capacity", "image", "is_published"), ("slug", "registration_link", "publish_at", "unpublish_at", "order"))


@admin.register(m.Opportunity)
class OpportunityAdmin(PublishedAdmin):
    list_display = ("title", "kind", "deadline")
    list_filter = ("kind",)
    prepopulated_fields = {"slug": ("title",)}
    fieldsets = easy(m.Opportunity, ("title", "kind", "summary", "description", "deadline", "apply_link", "is_published"), ("slug", "publish_at", "unpublish_at", "order"))


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
    list_display = ("created", "request_type", "name", "email", "organization", "status", "assigned_to", "email_sent", "confirmation_sent", "crm_status")
    list_filter = ("status", "request_type", "assigned_to", "email_sent")
    list_editable = ("status", "assigned_to")
    search_fields = ("name", "email", "organization", "message")
    readonly_fields = ("created", "email_sent", "confirmation_sent", "language", "crm_status")
    date_hierarchy = "created"
    actions = ["resend_to_crm", "assign_to_me", "mark_in_progress", "mark_closed", "export_csv"]

    def save_model(self, request, obj, form, change):
        notify = change and "assigned_to" in form.changed_data and obj.assigned_to and obj.assigned_to.email
        super().save_model(request, obj, form, change)
        if notify:
            from .emails import send_safe
            send_safe(f"[SiaNexis] Request assigned to you: {obj.get_request_type_display()} - {obj.name}",
                      f"{obj.name} <{obj.email}>\n{obj.organization}\n\n{obj.message}\n\n"
                      f"Open: {request.build_absolute_uri(request.path)}", obj.assigned_to.email)

    @admin.action(description=_("Send selected to CRM again"))
    def resend_to_crm(self, request, queryset):
        from . import crm

        if not crm.enabled():
            self.message_user(request, _("No CRM is configured (set CRM_WEBHOOK_URL or HUBSPOT_TOKEN)."), messages.WARNING)
            return
        for r in queryset:
            crm.push("contact_request", r, {"name": r.name, "email": r.email, "organization": r.organization, "type": r.request_type,
                                            "subject": r.subject, "message": r.message, "language": r.language})
        self.message_user(request, _("%(n)s request(s) queued for the CRM.") % {"n": queryset.count()})

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
    fieldsets = easy(m.Post, ("title", "summary", "body", "image", "published_at", "is_published"), ("slug", "author_name", "publish_at", "unpublish_at", "order"), seo=True)


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


@admin.register(m.Metric)
class MetricAdmin(PublishedAdmin):
    list_display = ("label", "value", "suffix")
