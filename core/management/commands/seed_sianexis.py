"""Create the structure defined in the client brief (English + Arabic) and editor roles. Safe to re-run."""
from django.contrib.auth.models import Group, Permission
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils.translation import override

from core import models as m

# (en title, icon, en summary, ar title, ar summary)
AREAS = [
    ("Psychiatry", "🧠", "Mental health research, clinical studies and outcomes.", "الطب النفسي", "أبحاث الصحة النفسية والدراسات السريرية ونتائج العلاج."),
    ("Neuroscience", "⚡", "Brain structure, function and neural data analysis.", "علوم الأعصاب", "بنية الدماغ ووظائفه وتحليل البيانات العصبية."),
    ("Oncology", "🎗", "Cancer epidemiology, clinical trials and outcomes research.", "علم الأورام", "وبائيات السرطان والتجارب السريرية وأبحاث النتائج."),
    ("Cardiology", "❤", "Cardiovascular studies, registries and risk modelling.", "أمراض القلب", "دراسات القلب والأوعية الدموية والسجلات ونمذجة المخاطر."),
    ("Public Health", "🌍", "Population health, surveillance and health-systems research.", "الصحة العامة", "صحة السكان والترصّد وأبحاث النظم الصحية."),
    ("Pediatrics", "🧒", "Child health and developmental research.", "طب الأطفال", "صحة الطفل والأبحاث التطورية."),
    ("Computational Research", "💻", "Machine learning, AI and scientific computing for medicine.", "الأبحاث الحاسوبية", "التعلّم الآلي والذكاء الاصطناعي والحوسبة العلمية في الطب."),
]
# (en category, en desc, ar category, ar desc, [(en service, ar service)])
SERVICES = [
    ("Research Services", "From research question to publication.", "الخدمات البحثية", "من صياغة السؤال البحثي حتى النشر.", [
        ("Research question development", "صياغة السؤال البحثي"), ("Study design", "تصميم الدراسات"),
        ("Protocol development", "إعداد البروتوكولات"), ("Evidence synthesis", "تجميع الأدلة العلمية"),
        ("Scientific writing", "الكتابة العلمية"), ("Publication support", "دعم النشر العلمي")]),
    ("Data & Statistics", "Rigorous data handling and analysis.", "البيانات والإحصاء", "معالجة وتحليل دقيقان للبيانات.", [
        ("Data management", "إدارة البيانات"), ("Statistical analysis", "التحليل الإحصائي"),
        ("Biostatistics", "الإحصاء الحيوي"), ("Statistical modeling", "النمذجة الإحصائية"),
        ("Data visualization", "تصوير البيانات")]),
    ("Computational Research", "Advanced computational methods.", "الأبحاث الحاسوبية", "أساليب حاسوبية متقدمة.", [
        ("Machine Learning", "التعلّم الآلي"), ("AI", "الذكاء الاصطناعي"),
        ("Computational Neuroscience", "علوم الأعصاب الحاسوبية"), ("Scientific Computing", "الحوسبة العلمية")]),
    ("Research Operations / CRO", "Coordination and compliance for multi-site research.", "العمليات البحثية / منظمة أبحاث تعاقدية (CRO)", "التنسيق والامتثال في الأبحاث متعددة المواقع.", [
        ("Multicenter research coordination", "تنسيق الأبحاث متعددة المراكز"), ("Site coordination", "تنسيق المواقع البحثية"),
        ("Research data management", "إدارة البيانات البحثية"), ("Quality assurance", "ضمان الجودة"),
        ("Research documentation", "التوثيق البحثي"), ("Regulatory and ethics support", "الدعم التنظيمي والأخلاقي")]),
]
ABOUT = [
    ("about", "About SiaNexis", "عن SiaNexis"),
    ("mission", "Our mission", "رسالتنا"),
    ("approach", "Research approach", "منهجنا البحثي"),
]


class Command(BaseCommand):
    def handle(self, *args, **opts):
        with override("en"):
            call_command("update_translation_fields", verbosity=0)  # copy existing rows into *_en columns
            s = m.SiteSettings.load()
            if not s.intro_text_en:
                s.hero_text_en = "SiaNexis supports researchers and institutions with study design, data and statistics, computational methods and multicenter research operations."
                s.intro_text_en = "SiaNexis is a research organization connecting clinical expertise, data science and collaborative networks. (Edit this text in the CMS under Site settings.)"
                s.cta_text_en = "Tell us about your research question, data or collaboration idea."
            def tr(field, value):
                # modeltranslation copies model defaults into every language; treat "same as English" as untranslated
                cur = getattr(s, field + "_ar")
                if not cur or cur == getattr(s, field + "_en"):
                    setattr(s, field + "_ar", value)

            tr("site_name", "SiaNexis")
            tr("tagline", "البحث والبيانات والحوسبة من أجل علم أفضل")
            tr("hero_title", "نُطوّر البحث العلمي بالتصميم الدقيق والبيانات والتعاون")
            tr("hero_text", "تدعم SiaNexis الباحثين والمؤسسات في تصميم الدراسات، وإدارة البيانات والتحليل الإحصائي، والأساليب الحاسوبية، وتشغيل الأبحاث متعددة المراكز.")
            tr("intro_text", "SiaNexis مؤسسة بحثية تجمع بين الخبرة السريرية وعلم البيانات وشبكات التعاون. (يمكنك تعديل هذا النص من لوحة التحكم ضمن إعدادات الموقع.)")
            tr("cta_title", "ابدأ مشروعًا أو اقترح تعاونًا")
            tr("cta_text", "أخبرنا عن سؤالك البحثي أو بياناتك أو فكرة التعاون التي تودّ تنفيذها.")
            s.save()

            for i, (t, icon, summ, t_ar, summ_ar) in enumerate(AREAS):
                a, _ = m.ResearchArea.objects.get_or_create(title_en=t, defaults={"icon": icon, "summary": summ, "description": summ, "order": i})
                if not a.title_ar:
                    a.title_ar, a.summary_ar, a.description_ar = t_ar, summ_ar, summ_ar
                    a.save()
            for i, (cat, desc, cat_ar, desc_ar, items) in enumerate(SERVICES):
                c, _ = m.ServiceCategory.objects.get_or_create(title_en=cat, defaults={"description": desc, "order": i})
                if not c.title_ar:
                    c.title_ar, c.description_ar = cat_ar, desc_ar
                    c.save()
                for j, (t, t_ar) in enumerate(items):
                    sv, _ = m.Service.objects.get_or_create(category=c, title_en=t, defaults={"order": j})
                    if not sv.title_ar:
                        sv.title_ar = t_ar
                        sv.save()
            for kind, title, title_ar in ABOUT:
                ab, _ = m.AboutSection.objects.get_or_create(kind=kind, defaults={"title": title, "body": "Draft text - replace from the CMS (About sections)."})
                if not ab.title_ar:
                    ab.title_ar, ab.body_ar = title_ar, "نص تمهيدي — استبدله من لوحة التحكم (أقسام من نحن)."
                    ab.save()

        # Roles: Editors manage everything in the content app; Contributors can add/change but not delete.
        perms = Permission.objects.filter(content_type__app_label="core")
        editors, _ = Group.objects.get_or_create(name="Editors")
        editors.permissions.set(perms)
        contrib, _ = Group.objects.get_or_create(name="Contributors")
        contrib.permissions.set(perms.filter(codename__regex=r"^(add|change|view)_").exclude(codename__endswith="sitesettings"))
        self.stdout.write(self.style.SUCCESS("Seeded (EN + AR). Groups: Editors, Contributors."))
