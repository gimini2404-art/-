from django.contrib import admin
from django.urls import reverse
from django.utils.translation import gettext_lazy as _

# Sidebar/dashboard sections: (title, [model names])
SECTIONS = [
    (_("Website"), "🌐", ["SiteSettings", "Metric", "Page", "AboutSection", "TeamMember", "Post"]),
    (_("Research & publications"), "🔬", ["ResearchArea", "ServiceCategory", "Service", "HubItem", "Project", "Publication", "Collaboration", "Organization"]),
    (_("Students"), "🎓", ["StudentProfile", "Enrollment", "ProjectRequest"]),
    (_("Engagement"), "📬", ["ContactRequest", "TrainingRegistration", "NewsletterSubscriber", "TrainingProgram", "Opportunity"]),
]


class SiaNexisAdminSite(admin.AdminSite):
    site_header = _("SiaNexis CMS")
    site_title = _("SiaNexis CMS")
    index_title = _("Manage website content")
    site_url = None  # the header has its own "View website" link

    def get_app_list(self, request, app_label=None):
        base = super().get_app_list(request, app_label)
        by_name = {m["object_name"]: m for app in base for m in app["models"]}
        sections, used = [], set()
        for title, icon, names in SECTIONS:
            models = [by_name[n] for n in names if n in by_name]
            used.update(n for n in names if n in by_name)
            if models:
                sections.append({"name": title, "icon": icon, "app_label": "core", "app_url": "", "has_module_perms": True, "models": models})
        rest = [m for app in base for m in app["models"] if m["object_name"] not in used]
        if rest:
            sections.append({"name": _("Users & access"), "icon": "👥", "app_label": "auth", "app_url": "", "has_module_perms": True, "models": rest})
        return sections

    def index(self, request, extra_context=None):
        from core import models as m

        extra = dict(extra_context or {})
        extra["attention"] = [
            (_("New contact requests"), m.ContactRequest.objects.filter(status="new").count(),
             reverse("admin:core_contactrequest_changelist") + "?status__exact=new", True),
            (_("Pending training registrations"), m.TrainingRegistration.objects.filter(status="pending").count(),
             reverse("admin:core_trainingregistration_changelist") + "?status__exact=pending", True),
            (_("Waiting-list registrations"), m.TrainingRegistration.objects.filter(status="waitlist").count(),
             reverse("admin:core_trainingregistration_changelist") + "?status__exact=waitlist", True),
            (_("Enrollments waiting for approval"), m.Enrollment.objects.filter(status="pending").count(),
             reverse("admin:core_enrollment_changelist") + "?status__exact=pending", True),
            (_("Student project requests to review"), m.ProjectRequest.objects.filter(status="submitted").count(),
             reverse("admin:core_projectrequest_changelist") + "?status__exact=submitted", True),
            (_("Active newsletter subscribers"), m.NewsletterSubscriber.objects.filter(is_active=True).count(),
             reverse("admin:core_newslettersubscriber_changelist") + "?is_active__exact=1", False),
        ]
        extra["tasks"] = [
            ("📄", _("Add a research paper"), _("Upload the PDF and publish in one click"), reverse("admin:core_publication_import_article"), True),
            ("📰", _("Write a news post"), _("Announcements and updates"), reverse("admin:core_post_add"), False),
            ("🔬", _("Add a project"), _("A study or case study"), reverse("admin:core_project_add"), False),
            ("🎓", _("Add a training workshop"), _("Courses and events with registration"), reverse("admin:core_trainingprogram_add"), False),
            ("👤", _("Add a team member"), _("Photo, role and profile"), reverse("admin:core_teammember_add"), False),
            ("🤝", _("Post an opportunity"), _("Calls for collaborators or students"), reverse("admin:core_opportunity_add"), False),
            ("🏠", _("Edit the home page texts"), _("Titles, contact details, announcement bar"), reverse("admin:core_sitesettings_change", args=[m.SiteSettings.load().pk]), False),
            ("🌐", _("View the website"), _("Open the public site"), "/", False),
        ]
        extra["quick_add"] = [
            (_("Project"), reverse("admin:core_project_add")), (_("News post"), reverse("admin:core_post_add")),
            (_("Publication"), reverse("admin:core_publication_add")), (_("Research Hub item"), reverse("admin:core_hubitem_add")),
            (_("Training program"), reverse("admin:core_trainingprogram_add")), (_("Opportunity"), reverse("admin:core_opportunity_add")),
        ]
        return super().index(request, extra)
