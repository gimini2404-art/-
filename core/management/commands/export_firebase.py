"""Export the CMS content to a JSON file for the Firebase version of the site (web/).

    python manage.py export_firebase firebase_export.json

Import it from the new admin (Dashboard > Import data) or with `node web/tools/import_seed.mjs`.
Image / file fields are exported as the site-relative path (e.g. /media/areas/x.webp). Upload those files to
Cloudinary and replace the paths, or use `node web/tools/upload_media.mjs` (see docs/FIREBASE_SPARK.md).
"""
import json

from django.core.management.base import BaseCommand

from core import models as m

DT = ("created", "updated", "publish_at", "unpublish_at")


def iso(v):
    return v.isoformat() if v else None


def media(f):
    return f"/media/{f.name}" if f else ""


class Command(BaseCommand):
    help = "Export content as JSON for the Firebase (JavaScript) version of the site."

    def add_arguments(self, parser):
        parser.add_argument("path", nargs="?", default="firebase_export.json")

    def handle(self, *args, **opts):
        out = {"format": 1, "collections": {}, "raw": {}}
        files = set()

        def doc_id(prefix, obj):
            slug = getattr(obj, "slug", None)
            return slug if slug else f"{prefix}-{obj.pk}"

        def base(obj, tr=(), plain=(), publish=True, media_fields=()):
            d = {}
            for f in tr:
                d[f"{f}_en"] = getattr(obj, f"{f}_en", None) or ""
                d[f"{f}_ar"] = getattr(obj, f"{f}_ar", None) or ""
            for f in plain:
                v = getattr(obj, f)
                d[f] = v.isoformat() if hasattr(v, "isoformat") else v
            for f in media_fields:
                d[f] = media(getattr(obj, f))
                if d[f]:
                    files.add(d[f])
            if publish:
                d.update(is_published=obj.is_published, publish_at=iso(obj.publish_at), unpublish_at=iso(obj.unpublish_at), order=obj.order)
            for f in ("created", "updated"):
                if hasattr(obj, f):
                    d[f] = iso(getattr(obj, f))
            return d

        seo = ("meta_title", "meta_description")

        def put(col, obj, prefix, data):
            data["_id"] = doc_id(prefix, obj)
            out["collections"].setdefault(col, []).append(data)

        s = m.SiteSettings.load()
        out["settings"] = base(s, tr=("site_name", "tagline", "hero_title", "hero_text", "intro_text", "cta_title", "cta_text", "announcement_text", "address",
                                       "footer_text", "default_meta_description"),
                               plain=("contact_email", "phone", "linkedin_url", "twitter_url", "announcement_url", "analytics_snippet", "ga_measurement_id",
                                      "plausible_domain", "privacy_url"), publish=False, media_fields=("logo",))
        for o in m.Page.objects.all():
            put("pages", o, "page", base(o, tr=("title", "summary", "body") + seo, plain=("slug", "show_in_menu")))
        for o in m.AboutSection.objects.all():
            put("aboutSections", o, "about", base(o, tr=("title", "body"), plain=("kind",), media_fields=("image",)))
        for o in m.ResearchArea.objects.all():
            put("areas", o, "area", base(o, tr=("title", "summary", "description") + seo, plain=("slug", "icon"), media_fields=("image",)))
        for o in m.ServiceCategory.objects.all():
            put("serviceCategories", o, "cat", base(o, tr=("title", "description"), plain=("slug",)))
        for o in m.Service.objects.all():
            d = base(o, tr=("title", "description"))
            d["category"] = o.category.slug
            put("services", o, "service", d)
        for o in m.Organization.objects.all():
            put("organizations", o, "org", base(o, tr=("name", "country"), plain=("website", "is_partner"), publish=False, media_fields=("logo",)))
        for o in m.Collaboration.objects.all():
            put("collaborations", o, "collab", base(o, tr=("organization_name", "country", "description"),
                                                    plain=("collaboration_type", "link", "latitude", "longitude"), media_fields=("logo",)))
        for o in m.Project.objects.all():
            d = base(o, tr=("title", "problem", "role", "methodology", "outcome") + seo, plain=("slug", "status", "featured"), media_fields=("image",))
            d["research_area"] = o.research_area.slug if o.research_area else ""
            d["institutions"] = [f"org-{i.pk}" for i in o.institutions.all()]
            put("projects", o, "project", d)
        pub_ids = {}
        for o in m.Publication.objects.all().prefetch_related("author_list", "sections", "figures", "references", "links"):
            d = base(o, tr=("title",), plain=("kind", "authors", "journal", "year", "doi", "external_link", "content_type", "open_access", "published_date",
                                                "received_date", "accepted_date", "volume", "issue", "article_number", "publisher", "issn", "license",
                                                "license_url", "keywords", "subjects", "abstract", "abstract_background", "abstract_methods", "abstract_results",
                                                "abstract_conclusion", "rights_text", "accesses", "citations", "altmetric", "mentions"), media_fields=("pdf",))
            if o.slug:
                d["slug"] = o.slug
            d["related_project"] = o.related_project.slug if o.related_project else ""
            d["author_list"] = [dict(name=a.name, given_name=a.given_name, family_name=a.family_name, affiliation=a.affiliation, corresponding=a.corresponding,
                                     email=a.email, orcid=a.orcid) for a in o.author_list.all()]
            d["sections"] = [dict(kind=x.kind, heading=x.heading, body=x.body) for x in o.sections.all()]
            figs = []
            for f in o.figures.all():
                img = media(f.image)
                if img:
                    files.add(img)
                figs.append(dict(kind=f.kind, number=f.number, label=f.label, caption=f.caption, image=img, table_html=f.table_html, note=f.note))
            d["figures"] = figs
            d["references"] = [dict(number=r.number, text=r.text, authors=r.authors, title=r.title, source=r.source, doi=r.doi, url=r.url) for r in o.references.all()]
            d["links"] = [dict(kind=l.kind, title=l.title, url=l.url, source=l.source) for l in o.links.all()]
            d["has_article"] = o.has_article
            put("publications", o, "pub", d)
            pub_ids[o.pk] = d["_id"]
        for o in m.TeamMember.objects.all():
            d = base(o, tr=("name", "role", "affiliation", "bio"), plain=("group", "slug", "profile_url", "orcid", "google_scholar_url"), media_fields=("photo",))
            d["publications"] = [pub_ids[p.pk] for p in o.publications.all() if p.pk in pub_ids]
            put("team", o, "team", d)
        for o in m.HubItem.objects.all():
            d = base(o, tr=("title", "summary", "description") + seo, plain=("slug", "category", "status", "link"), media_fields=("image",))
            d["research_area"] = o.research_area.slug if o.research_area else ""
            d["related_project"] = o.related_project.slug if o.related_project else ""
            put("hub", o, "hub", d)
        for o in m.TrainingProgram.objects.all():
            put("training", o, "training", base(o, tr=("title", "summary", "description", "duration", "format"),
                                                plain=("slug", "kind", "start_date", "registration_link", "registration_open", "capacity"), media_fields=("image",)))
        for o in m.Opportunity.objects.all():
            put("opportunities", o, "opp", base(o, tr=("title", "summary", "description"), plain=("slug", "kind", "deadline", "apply_link")))
        for o in m.Post.objects.all():
            put("posts", o, "post", base(o, tr=("title", "summary", "body") + seo, plain=("slug", "author_name", "published_at"), media_fields=("image",)))
        for o in m.Metric.objects.all():
            put("metrics", o, "metric", base(o, tr=("label",), plain=("value", "suffix")))

        out["raw"]["contactRequests"] = [dict(request_type=c.request_type, name=c.name, email=c.email, organization=c.organization, subject=c.subject,
                                              message=c.message, status=c.status, internal_notes=c.internal_notes, language=c.language, created=iso(c.created))
                                         for c in m.ContactRequest.objects.all()]
        out["raw"]["subscribers"] = [dict(email=s_.email, token=s_.token, language=s_.language, is_active=s_.is_active, created=iso(s_.created))
                                     for s_ in m.NewsletterSubscriber.objects.all()]
        out["raw"]["registrations"] = [dict(program=r.program.slug, program_title=r.program.title_en or r.program.title, name=r.name, email=r.email,
                                            organization=r.organization, phone=r.phone, message=r.message, status=r.status, language=r.language,
                                            created=iso(r.created)) for r in m.TrainingRegistration.objects.select_related("program")]
        out["media_files"] = sorted(files)
        with open(opts["path"], "w", encoding="utf-8") as fh:
            json.dump(out, fh, ensure_ascii=False, indent=1, default=str)
        total = sum(len(v) for v in out["collections"].values())
        self.stdout.write(f"{total} documents in {len(out['collections'])} collections -> {opts['path']} ({len(files)} media files referenced)")
