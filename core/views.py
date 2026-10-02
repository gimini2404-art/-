import logging

from django.conf import settings
from django.core.mail import send_mail
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render

from . import models as m
from .forms import ContactForm

log = logging.getLogger(__name__)


def live(model):
    return model.objects.filter(is_published=True)


def home(request):
    return render(request, "core/home.html", {
        "areas": live(m.ResearchArea),
        "categories": live(m.ServiceCategory),
        "programs": live(m.HubItem).filter(category__in=["program", "ongoing", "multicenter"])[:6],
        "featured": live(m.Project).filter(featured=True)[:3],
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
    groups = [(label, [p for p in items if p.kind == key]) for key, label in m.Publication.KINDS]
    return render(request, "core/publications.html", {"groups": [g for g in groups if g[1]]})


def training(request):
    items = live(m.TrainingProgram)
    groups = [(label, [t for t in items if t.kind == key]) for key, label in m.TrainingProgram.KINDS]
    return render(request, "core/training.html", {"groups": [g for g in groups if g[1]]})


def opportunities(request):
    items = live(m.Opportunity)
    groups = [(label, [o for o in items if o.kind == key]) for key, label in m.Opportunity.KINDS]
    return render(request, "core/opportunities.html", {"groups": [g for g in groups if g[1]]})


def contact(request):
    initial = {"request_type": request.GET.get("type", "research_project"), "subject": request.GET.get("subject", "")}
    form = ContactForm(request.POST or None, initial=initial)
    if request.method == "POST" and form.is_valid():
        obj = form.save()
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
        return redirect("contact_thanks")
    return render(request, "core/contact.html", {"form": form})


def contact_thanks(request):
    return render(request, "core/contact_thanks.html")


def page(request, slug):
    return render(request, "core/page.html", {"page": get_object_or_404(live(m.Page), slug=slug)})


def robots_txt(request):
    lines = ["User-agent: *", "Disallow: /admin/", f"Sitemap: {request.build_absolute_uri('/sitemap.xml')}"]
    return HttpResponse("\n".join(lines), content_type="text/plain")
