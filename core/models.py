from django.db import models
from django.urls import reverse
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _


class SEOMixin(models.Model):
    meta_title = models.CharField(max_length=70, blank=True, help_text="Leave blank to use the title.")
    meta_description = models.CharField(max_length=170, blank=True)

    class Meta:
        abstract = True


class Published(models.Model):
    is_published = models.BooleanField(default=True, help_text="Untick to hide from the public site.")
    order = models.PositiveIntegerField(default=0, help_text="Lower numbers appear first.")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SlugMixin(models.Model):
    slug = models.SlugField(max_length=140, unique=True, blank=True, help_text="Auto-filled from the title.")

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(getattr(self, "title_en", None) or getattr(self, "title", None) or getattr(self, "name", "")) or "item"
            slug, n = base, 2
            while type(self).objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug, n = f"{base}-{n}", n + 1
            self.slug = slug
        super().save(*args, **kwargs)


class SiteSettings(models.Model):
    """Singleton: global site content edited from the CMS."""

    site_name = models.CharField(max_length=80, default="SiaNexis")
    tagline = models.CharField(max_length=160, default="Research, data and computation for better science")
    logo = models.ImageField(upload_to="branding/", blank=True)
    hero_title = models.CharField(max_length=160, default="Advancing research through design, data and collaboration")
    hero_text = models.TextField(blank=True)
    intro_text = models.TextField(blank=True, help_text="Short 'about SiaNexis' text on the home page.")
    cta_title = models.CharField(max_length=120, default="Start a project or propose a collaboration")
    cta_text = models.CharField(max_length=240, blank=True)
    contact_email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    address = models.CharField(max_length=200, blank=True)
    linkedin_url = models.URLField(blank=True)
    twitter_url = models.URLField(blank=True)
    footer_text = models.CharField(max_length=200, blank=True)
    default_meta_description = models.CharField(max_length=170, blank=True)
    analytics_snippet = models.TextField(blank=True, help_text="Optional tracking script (e.g. analytics).")

    class Meta:
        verbose_name = "Site settings"
        verbose_name_plural = "Site settings"

    def __str__(self):
        return "Site settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        return cls.objects.get_or_create(pk=1)[0]


class Page(SEOMixin, Published, SlugMixin):
    """Generic CMS page (About blocks, policies, any future page)."""

    title = models.CharField(max_length=140)
    summary = models.CharField(max_length=240, blank=True)
    body = models.TextField(blank=True, help_text="Plain text. Blank lines become paragraphs.")
    show_in_menu = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "title"]

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse("page", args=[self.slug])


class AboutSection(Published):
    """Blocks on the About page: About, Mission, Research approach."""

    KINDS = [("about", _("About SiaNexis")), ("mission", _("Mission")), ("approach", _("Research approach"))]
    kind = models.CharField(max_length=20, choices=KINDS)
    title = models.CharField(max_length=140)
    body = models.TextField()
    image = models.ImageField(upload_to="about/", blank=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.get_kind_display()}: {self.title}"


class TeamMember(Published):
    GROUPS = [("team", _("Team")), ("advisory", _("Advisory Board"))]
    group = models.CharField(max_length=20, choices=GROUPS, default="team")
    name = models.CharField(max_length=120)
    role = models.CharField(max_length=160)
    affiliation = models.CharField(max_length=200, blank=True)
    bio = models.TextField(blank=True)
    photo = models.ImageField(upload_to="team/", blank=True)
    profile_url = models.URLField(blank=True)

    class Meta:
        ordering = ["group", "order", "name"]

    def __str__(self):
        return self.name


class ResearchArea(SEOMixin, Published, SlugMixin):
    title = models.CharField(max_length=120)
    summary = models.CharField(max_length=240, blank=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=8, blank=True, help_text="An emoji or short symbol.")
    image = models.ImageField(upload_to="areas/", blank=True)

    class Meta:
        ordering = ["order", "title"]

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse("research_area", args=[self.slug])


class ServiceCategory(Published, SlugMixin):
    title = models.CharField(max_length=120)
    description = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["order", "title"]
        verbose_name_plural = "service categories"

    def __str__(self):
        return self.title


class Service(Published):
    category = models.ForeignKey(ServiceCategory, on_delete=models.CASCADE, related_name="services")
    title = models.CharField(max_length=140)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["category__order", "order", "title"]

    def __str__(self):
        return self.title


class Organization(models.Model):
    name = models.CharField(max_length=200)
    country = models.CharField(max_length=80, blank=True)
    logo = models.ImageField(upload_to="orgs/", blank=True)
    website = models.URLField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Collaboration(Published):
    TYPES = [
        ("academic", _("Academic collaboration")),
        ("hospital", _("Hospital collaboration")),
        ("research_center", _("Research center collaboration")),
        ("international", _("International collaboration")),
        ("multicenter", _("Multicenter collaboration")),
    ]
    organization_name = models.CharField(max_length=200)
    country = models.CharField(max_length=80, blank=True)
    collaboration_type = models.CharField(max_length=30, choices=TYPES)
    description = models.TextField(blank=True, verbose_name="Project description")
    logo = models.ImageField(upload_to="collaborations/", blank=True)
    link = models.URLField(blank=True, verbose_name="Website / link")

    class Meta:
        ordering = ["collaboration_type", "order", "organization_name"]

    def __str__(self):
        return self.organization_name


class Project(SEOMixin, Published, SlugMixin):
    STATUS = [("planned", _("Planned")), ("ongoing", _("Ongoing")), ("completed", _("Completed"))]
    title = models.CharField(max_length=200)
    research_area = models.ForeignKey(ResearchArea, null=True, blank=True, on_delete=models.SET_NULL, related_name="projects")
    problem = models.TextField(blank=True, verbose_name="Research question / problem")
    role = models.TextField(blank=True, verbose_name="SiaNexis role")
    methodology = models.TextField(blank=True)
    outcome = models.TextField(blank=True, verbose_name="Outcome")
    status = models.CharField(max_length=20, choices=STATUS, default="ongoing")
    institutions = models.ManyToManyField(Organization, blank=True, related_name="projects", verbose_name="Collaborating institutions")
    image = models.ImageField(upload_to="projects/", blank=True)
    featured = models.BooleanField(default=False, help_text="Show on the home page.")

    class Meta:
        ordering = ["order", "-created"]

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse("project", args=[self.slug])


class Publication(Published):
    KINDS = [("paper", _("Published paper")), ("manuscript", _("Ongoing manuscript")), ("output", _("Research output"))]
    kind = models.CharField(max_length=20, choices=KINDS, default="paper")
    title = models.CharField(max_length=300)
    authors = models.CharField(max_length=500)
    journal = models.CharField(max_length=200, blank=True)
    year = models.PositiveIntegerField(null=True, blank=True)
    doi = models.CharField(max_length=120, blank=True, help_text="e.g. 10.1000/xyz123 (no URL prefix)")
    external_link = models.URLField(blank=True)
    pdf = models.FileField(upload_to="publications/", blank=True)
    related_project = models.ForeignKey(Project, null=True, blank=True, on_delete=models.SET_NULL, related_name="publications")

    class Meta:
        ordering = ["-year", "order", "title"]

    def __str__(self):
        return self.title

    @property
    def doi_url(self):
        return f"https://doi.org/{self.doi}" if self.doi else ""


class HubItem(SEOMixin, Published, SlugMixin):
    """Research Hub entries. Add any number from the CMS without code changes."""

    CATEGORIES = [
        ("program", _("Research Programs")),
        ("ongoing", _("Ongoing Studies")),
        ("multicenter", _("Multicenter Studies")),
        ("network", _("Research Networks")),
        ("collaboration", _("Research Collaborations")),
        ("opportunity", _("Research Opportunities")),
        ("project", _("Research Projects")),
    ]
    STATUS = [("planned", _("Planned")), ("recruiting", _("Recruiting")), ("ongoing", _("Ongoing")), ("completed", _("Completed"))]
    category = models.CharField(max_length=20, choices=CATEGORIES)
    title = models.CharField(max_length=200)
    summary = models.CharField(max_length=300, blank=True)
    description = models.TextField(blank=True)
    research_area = models.ForeignKey(ResearchArea, null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=20, choices=STATUS, default="ongoing")
    image = models.ImageField(upload_to="hub/", blank=True)
    link = models.URLField(blank=True)
    related_project = models.ForeignKey(Project, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["category", "order", "-created"]

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse("hub_item", args=[self.slug])


class TrainingProgram(Published, SlugMixin):
    KINDS = [
        ("program", _("Research training program")),
        ("workshop", _("Workshop")),
        ("course", _("Research course")),
        ("institutional", _("Institutional training")),
        ("mentorship", _("Research mentorship")),
    ]
    kind = models.CharField(max_length=20, choices=KINDS)
    title = models.CharField(max_length=200)
    summary = models.CharField(max_length=300, blank=True)
    description = models.TextField(blank=True)
    start_date = models.DateField(null=True, blank=True)
    duration = models.CharField(max_length=80, blank=True)
    format = models.CharField(max_length=80, blank=True, help_text="Online / In person / Hybrid")
    registration_link = models.URLField(blank=True)
    image = models.ImageField(upload_to="training/", blank=True)

    class Meta:
        ordering = ["kind", "order", "-start_date"]

    def __str__(self):
        return self.title


class Opportunity(Published, SlugMixin):
    KINDS = [
        ("research", _("Research opportunity")),
        ("open_project", _("Open project")),
        ("collaborators", _("Call for collaborators")),
        ("sites", _("Call for research sites")),
        ("volunteer", _("Volunteer / expert opportunity")),
        ("student", _("Student / researcher opportunity")),
    ]
    kind = models.CharField(max_length=20, choices=KINDS)
    title = models.CharField(max_length=200)
    summary = models.CharField(max_length=300, blank=True)
    description = models.TextField(blank=True)
    deadline = models.DateField(null=True, blank=True)
    apply_link = models.URLField(blank=True, help_text="Leave blank to use the contact form.")

    class Meta:
        ordering = ["kind", "order", "deadline"]
        verbose_name_plural = "opportunities"

    def __str__(self):
        return self.title


class ContactRequest(models.Model):
    TYPES = [
        ("research_project", _("Research project")),
        ("data_analysis", _("Statistical / Data analysis")),
        ("collaboration", _("Research collaboration")),
        ("multicenter", _("Multicenter study")),
        ("partnership", _("Institutional partnership")),
        ("training", _("Training")),
        ("other", _("Other")),
    ]
    STATUS = [("new", _("New")), ("in_progress", _("In progress")), ("closed", _("Closed"))]
    request_type = models.CharField(_("Request type"), max_length=30, choices=TYPES)
    name = models.CharField(_("Name"), max_length=120)
    email = models.EmailField(_("Email"))
    organization = models.CharField(_("Organization"), max_length=200, blank=True)
    subject = models.CharField(_("Subject"), max_length=200, blank=True)
    message = models.TextField(_("Message"))
    status = models.CharField(max_length=20, choices=STATUS, default="new")
    internal_notes = models.TextField(blank=True)
    email_sent = models.BooleanField(default=False, editable=False)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created"]

    def __str__(self):
        return f"{self.get_request_type_display()} - {self.name}"
