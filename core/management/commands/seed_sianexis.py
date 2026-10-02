"""Create the structure defined in the client brief + editor roles. Safe to re-run."""
from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand

from core import models as m

AREAS = [
    ("Psychiatry", "🧠", "Mental health research, clinical studies and outcomes."),
    ("Neuroscience", "⚡", "Brain structure, function and neural data analysis."),
    ("Oncology", "🎗", "Cancer epidemiology, clinical trials and outcomes research."),
    ("Cardiology", "❤", "Cardiovascular studies, registries and risk modelling."),
    ("Public Health", "🌍", "Population health, surveillance and health-systems research."),
    ("Pediatrics", "🧒", "Child health and developmental research."),
    ("Computational Research", "💻", "Machine learning, AI and scientific computing for medicine."),
]
SERVICES = {
    ("Research Services", "From research question to publication."): [
        "Research question development", "Study design", "Protocol development",
        "Evidence synthesis", "Scientific writing", "Publication support"],
    ("Data & Statistics", "Rigorous data handling and analysis."): [
        "Data management", "Statistical analysis", "Biostatistics",
        "Statistical modeling", "Data visualization"],
    ("Computational Research", "Advanced computational methods."): [
        "Machine Learning", "AI", "Computational Neuroscience", "Scientific Computing"],
    ("Research Operations / CRO", "Coordination and compliance for multi-site research."): [
        "Multicenter research coordination", "Site coordination", "Research data management",
        "Quality assurance", "Research documentation", "Regulatory and ethics support"],
}


class Command(BaseCommand):
    def handle(self, *args, **opts):
        s = m.SiteSettings.load()
        if not s.intro_text:
            s.hero_text = "SiaNexis supports researchers and institutions with study design, data and statistics, computational methods and multicenter research operations."
            s.intro_text = "SiaNexis is a research organization connecting clinical expertise, data science and collaborative networks. (Edit this text in the CMS under Site settings.)"
            s.cta_text = "Tell us about your research question, data or collaboration idea."
            s.save()
        for i, (t, icon, summ) in enumerate(AREAS):
            m.ResearchArea.objects.get_or_create(title=t, defaults={"icon": icon, "summary": summ, "description": summ, "order": i})
        for i, ((cat, desc), items) in enumerate(SERVICES.items()):
            c, _ = m.ServiceCategory.objects.get_or_create(title=cat, defaults={"description": desc, "order": i})
            for j, t in enumerate(items):
                m.Service.objects.get_or_create(category=c, title=t, defaults={"order": j})
        for kind, title in [("about", "About SiaNexis"), ("mission", "Our mission"), ("approach", "Research approach")]:
            m.AboutSection.objects.get_or_create(kind=kind, defaults={"title": title, "body": "Draft text - replace from the CMS (About sections)."})

        # Roles: Editors manage everything in the content app; Contributors can add/change but not delete.
        perms = Permission.objects.filter(content_type__app_label="core")
        editors, _ = Group.objects.get_or_create(name="Editors")
        editors.permissions.set(perms)
        contrib, _ = Group.objects.get_or_create(name="Contributors")
        contrib.permissions.set(perms.filter(codename__regex=r"^(add|change|view)_").exclude(codename__endswith="sitesettings"))
        self.stdout.write(self.style.SUCCESS("Seeded. Groups: Editors, Contributors."))
