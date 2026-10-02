import logging

from django.conf import settings
from django.core.mail import send_mail
from django.http import HttpResponse
from django.utils.translation import gettext_lazy as _
from django.shortcuts import get_object_or_404, redirect, render

from . import models as m
from django.contrib import messages
from django.db.models import Q
from django.utils import translation
from django.utils.http import url_has_allowed_host_and_scheme

from . import emails
from .forms import ContactForm, NewsletterForm, TrainingRegistrationForm

log = logging.getLogger(__name__)

PLURAL = {
    "pub": {"paper": _("Published papers"), "manuscript": _("Ongoing manuscripts"), "output": _("Research outputs")},
    "training": {"program": _("Research training programs"), "workshop": _("Workshops"), "course": _("Research courses"),
                 "institutional": _("Institutional training"), "mentorship": _("Research mentorship")},
    "opp": {"research": _("Research opportunities"), "open_project": _("Open projects"), "collaborators": _("Calls for collaborators"),
            "sites": _("Calls for research sites"), "volunteer": _("Volunteer / expert opportunities"),
            "student": _("Student / researcher opportunities")},
}


def live(model):
    return model.objects.filter(is_published=True)


def home(request):
    return render(request, "core/home.html", {
        "areas": live(m.ResearchArea),
        "categories": live(m.ServiceCategory),
        "programs": live(m.HubItem).filter(category__in=["program", "ongoing", "multicenter"])[:6],
        "featured": live(m.Project).filter(featured=True)[:3],
        "news": live(m.Post)[:3],
        "stats": [
            (live(m.ResearchArea).count(), _("Research areas")),
            (live(m.ServiceCategory).count(), _("Service lines")),
            (live(m.Service).count(), _("Specialised services")),
            (len(m.HubItem.CATEGORIES), _("Research Hub streams")),
        ],
    })


def about(request):
    sections = {k: [s for s in live(m.AboutSection) if s.kind == k] for k, _ in m.AboutSection.KINDS}
    members = live(m.TeamMember)
    return render(request, "core/about.html", {
        "sections": sections,
        "team": [x for x in members if x.group == "team"],
        "advisory": [x for x in members if x.group == "advisory"],
    })


def research_areas(request):
    return render(request, "core/research_areas.html", {"areas": live(m.ResearchArea)})


def research_area(request, slug):
    area = get_object_or_404(live(m.ResearchArea), slug=slug)
    return render(request, "core/research_area.html", {
        "area": area,
        "projects": live(m.Project).filter(research_area=area),
        "hub_items": live(m.HubItem).filter(research_area=area),
    })


def services(request):
    return render(request, "core/services.html", {
        "categories": live(m.ServiceCategory).prefetch_related("services"),
    })


def hub(request):
    cat = request.GET.get("category", "")
    items = live(m.HubItem).select_related("research_area")
    valid = dict(m.HubItem.CATEGORIES)
    if cat in valid:
        items = items.filter(category=cat)
    else:
        cat = ""
    return render(request, "core/hub.html", {"items": items, "categories": m.HubItem.CATEGORIES, "current": cat})


def hub_item(request, slug):
    return render(request, "core/hub_item.html", {"item": get_object_or_404(live(m.HubItem), slug=slug)})


def collaborations(request):
    items = live(m.Collaboration)
    groups = [(label, [c for c in items if c.collaboration_type == key]) for key, label in m.Collaboration.TYPES]
    return render(request, "core/collaborations.html", {"groups": [g for g in groups if g[1]]})


def projects(request):
    area = request.GET.get("area", "")
    qs = live(m.Project).select_related("research_area")
    if area:
        qs = qs.filter(research_area__slug=area)
    return render(request, "core/projects.html", {"projects": qs, "areas": live(m.ResearchArea), "current": area})


def project(request, slug):
    p = get_object_or_404(live(m.Project).select_related("research_area").prefetch_related("institutions"), slug=slug)
    return render(request, "core/project.html", {"project": p, "publications": live(m.Publication).filter(related_project=p)})


def publications(request):
    items = live(m.Publication).select_related("related_project")
    kind, year, project = request.GET.get("type", ""), request.GET.get("year", ""), request.GET.get("project", "")
    years = sorted({y for y in items.values_list("year", flat=True) if y}, reverse=True)
    if kind in dict(m.Publication.KINDS):
        items = items.filter(kind=kind)
    else:
        kind = ""
    if year.isdigit():
        items = items.filter(year=int(year))
    else:
        year = ""
    if project.isdigit():
        items = items.filter(related_project_id=int(project))
    else:
        project = ""
    groups = [(PLURAL["pub"][key], [p for p in items if p.kind == key]) for key, _l in m.Publication.KINDS]
    return render(request, "core/publications.html", {
        "groups": [g for g in groups if g[1]], "years": years, "kinds": m.Publication.KINDS,
        "projects": live(m.Project).filter(publications__isnull=False).distinct(),
        "f_kind": kind, "f_year": year, "f_project": project, "total": items.count(),
    })


def training(request):
    items = live(m.TrainingProgram)
    groups = [(PLURAL["training"][key], [t for t in items if t.kind == key]) for key, _l in m.TrainingProgram.KINDS]
    return render(request, "core/training.html", {"groups": [g for g in groups if g[1]]})


def opportunities(request):
    items = live(m.Opportunity)
    groups = [(PLURAL["opp"][key], [o for o in items if o.kind == key]) for key, _l in m.Opportunity.KINDS]
    return render(request, "core/opportunities.html", {"groups": [g for g in groups if g[1]]})


def contact(request):
    initial = {"request_type": request.GET.get("type", "research_project"), "subject": request.GET.get("subject", "")}
    form = ContactForm(request.POST or None, initial=initial)
    if request.method == "POST" and form.is_valid():
        obj = form.save(commit=False)
        obj.language = translation.get_language() or ""
        obj.save()
        to = m.SiteSettings.load().contact_email or settings.CONTACT_EMAIL
        try:
            send_mail(
                f"[SiaNexis] {obj.get_request_type_display()} from {obj.name}",
                f"Type: {obj.get_request_type_display()}\nName: {obj.name}\nEmail: {obj.email}\n"
                f"Organization: {obj.organization}\nSubject: {obj.subject}\n\n{obj.message}",
                settings.DEFAULT_FROM_EMAIL, [to], fail_silently=False,
            )
            obj.email_sent = True
            obj.save(update_fields=["email_sent"])
        except Exception:  # request is already stored in the CMS
            log.exception("Contact email failed for request %s", obj.pk)
        obj.confirmation_sent = emails.contact_confirmation(obj)
        obj.save(update_fields=["confirmation_sent"])
        return redirect("contact_thanks")
    return render(request, "core/contact.html", {"form": form})


def contact_thanks(request):
    return render(request, "core/contact_thanks.html")


def page(request, slug):
    return render(request, "core/page.html", {"page": get_object_or_404(live(m.Page), slug=slug)})


def robots_txt(request):
    lines = ["User-agent: *", "Disallow: /admin/", f"Sitemap: {request.build_absolute_uri('/sitemap.xml')}"]
    return HttpResponse("\n".join(lines), content_type="text/plain")


def posts(request):
    return render(request, "core/posts.html", {"posts": live(m.Post)})


def post(request, slug):
    p = get_object_or_404(live(m.Post), slug=slug)
    return render(request, "core/post.html", {"post": p, "latest": live(m.Post).exclude(pk=p.pk)[:3]})


def training_register(request, slug):
    program = get_object_or_404(live(m.TrainingProgram), slug=slug)
    open_ = program.registration_open and not program.registration_link
    form = TrainingRegistrationForm(request.POST or None)
    if open_ and request.method == "POST" and form.is_valid():
        email = form.cleaned_data["email"].strip().lower()
        if m.TrainingRegistration.objects.filter(program=program, email__iexact=email).exists():
            form.add_error("email", _("This email is already registered for this program."))
        else:
            reg = form.save(commit=False)
            reg.program, reg.email = program, email
            reg.language = translation.get_language() or ""
            reg.status = "waitlist" if program.is_full else "pending"
            reg.save()
            emails.registration_confirmation(reg)
            messages.success(request, _("Thank you! Your registration was received. Check your email for details.")
                             if reg.status != "waitlist" else _("The program is full. You were added to the waiting list."))
            return redirect("training_register", slug=slug)
    return render(request, "core/training_register.html", {"program": program, "form": form, "open": open_})


def newsletter_subscribe(request):
    nxt = request.POST.get("next", "/")
    if not url_has_allowed_host_and_scheme(nxt, allowed_hosts={request.get_host()}):
        nxt = "/"
    if request.method == "POST":
        form = NewsletterForm(request.POST)
        if form.is_valid():
            sub, created = m.NewsletterSubscriber.objects.get_or_create(
                email=form.cleaned_data["email"], defaults={"language": translation.get_language() or ""})
            if not created and not sub.is_active:
                sub.is_active = True
                sub.save(update_fields=["is_active"])
            messages.success(request, _("Thank you for subscribing to our newsletter."))
        else:
            messages.error(request, _("Please enter a valid email address."))
    return redirect(nxt)


def newsletter_unsubscribe(request, token):
    sub = get_object_or_404(m.NewsletterSubscriber, token=token)
    if request.method == "POST":
        sub.is_active = False
        sub.save(update_fields=["is_active"])
        return render(request, "core/unsubscribed.html")
    return render(request, "core/unsubscribe.html", {"sub": sub})


# fields searched per model, in both languages
SEARCH_FIELDS = {
    m.ResearchArea: ["title", "summary", "description"],
    m.Service: ["title", "description"],
    m.Project: ["title", "problem", "methodology", "outcome"],
    m.HubItem: ["title", "summary", "description"],
    m.Post: ["title", "summary", "body"],
    m.TrainingProgram: ["title", "summary", "description"],
    m.Opportunity: ["title", "summary", "description"],
    m.Collaboration: ["organization_name", "description"],
    m.Publication: ["title", "authors", "journal", "doi"],
}


def _search(model, fields, q):
    cond = Q()
    names = {f.name for f in model._meta.get_fields()}
    for f in fields:
        for suffix in ("", "_en", "_ar"):
            if f + suffix in names:
                cond |= Q(**{f + suffix + "__icontains": q})
    return live(model).filter(cond).distinct()[:20]


def search(request):
    q = request.GET.get("q", "").strip()[:100]
    results = []
    if len(q) >= 2:
        for model, fields in SEARCH_FIELDS.items():
            found = list(_search(model, fields, q))
            if found:
                results.append((model._meta.verbose_name_plural.title(), model, found))
    labels = {m.ResearchArea: _("Research Areas"), m.Service: _("Services"), m.Project: _("Projects"), m.HubItem: _("Research Hub"),
              m.Post: _("News"), m.TrainingProgram: _("Training"), m.Opportunity: _("Opportunities"),
              m.Collaboration: _("Collaborations"), m.Publication: _("Publications")}
    groups = [(labels[model], found) for _t, model, found in results]
    return render(request, "core/search.html", {"q": q, "groups": groups, "count": sum(len(g[1]) for g in groups)})
