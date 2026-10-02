import secrets

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.urls import reverse
from django.utils import timezone
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _


from .fields import OptimizedImageField  # noqa: E402


class SEOMixin(models.Model):
    meta_title = models.CharField(max_length=70, blank=True, help_text="Leave blank to use the title.")
    meta_description = models.CharField(max_length=170, blank=True)

    class Meta:
        abstract = True


class Published(models.Model):
    is_published = models.BooleanField(default=True, help_text="Untick to hide from the public site.")
    publish_at = models.DateTimeField(null=True, blank=True, help_text="Optional: show on the site from this date/time.")
    unpublish_at = models.DateTimeField(null=True, blank=True, help_text="Optional: hide from the site after this date/time.")
    order = models.PositiveIntegerField(default=0, help_text="Lower numbers appear first.")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    @property
    def state(self):
        """live | scheduled | expired | draft"""
        now = timezone.now()
        if not self.is_published:
            return "draft"
        if self.publish_at and self.publish_at > now:
            return "scheduled"
        if self.unpublish_at and self.unpublish_at <= now:
            return "expired"
        return "live"

    @property
    def is_live(self):
        return self.state == "live"


def live_filter():
    now = timezone.now()
    return (Q(is_published=True) & (Q(publish_at__isnull=True) | Q(publish_at__lte=now))
            & (Q(unpublish_at__isnull=True) | Q(unpublish_at__gt=now)))


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
    logo = OptimizedImageField(upload_to="branding/", blank=True)
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
    announcement_text = models.CharField(max_length=240, blank=True, help_text="Optional notice bar shown at the top of article pages.")
    announcement_url = models.URLField(blank=True)
    analytics_snippet = models.TextField(blank=True, help_text="Optional tracking script (e.g. analytics).")
    ga_measurement_id = models.CharField(max_length=20, blank=True, help_text="Google Analytics 4 ID, e.g. G-XXXXXXXXXX. Loaded only after the visitor accepts cookies.")
    plausible_domain = models.CharField(max_length=120, blank=True, help_text="Plausible domain, e.g. sianexis.com (cookie-free analytics).")
    privacy_url = models.CharField(max_length=200, blank=True, help_text="Link of the privacy policy page, e.g. /en/p/privacy/")

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
    image = OptimizedImageField(upload_to="about/", blank=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.get_kind_display()}: {self.title}"


class TeamMember(Published):
    GROUPS = [("team", _("Team")), ("advisory", _("Advisory Board"))]
    group = models.CharField(max_length=20, choices=GROUPS, default="team")
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True, null=True, blank=True, help_text="Auto-filled from the title.")
    role = models.CharField(max_length=160)
    affiliation = models.CharField(max_length=200, blank=True)
    bio = models.TextField(blank=True)
    photo = OptimizedImageField(upload_to="team/", blank=True)
    profile_url = models.URLField(blank=True)
    orcid = models.CharField(max_length=19, blank=True, help_text="e.g. 0000-0002-1825-0097")
    google_scholar_url = models.URLField(blank=True)
    publications = models.ManyToManyField("Publication", blank=True, related_name="team_members")

    class Meta:
        ordering = ["group", "order", "name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(getattr(self, "name_en", None) or self.name) or "member"
            slug, n = base, 2
            while TeamMember.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug, n = f"{base}-{n}", n + 1
            self.slug = slug
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse("team_member", args=[self.slug])

    @property
    def orcid_url(self):
        return f"https://orcid.org/{self.orcid}" if self.orcid else ""


class ResearchArea(SEOMixin, Published, SlugMixin):
    title = models.CharField(max_length=120)
    summary = models.CharField(max_length=240, blank=True)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=8, blank=True, help_text="An emoji or short symbol.")
    image = OptimizedImageField(upload_to="areas/", blank=True)

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
    logo = OptimizedImageField(upload_to="orgs/", blank=True)
    website = models.URLField(blank=True)
    is_partner = models.BooleanField(default=False, help_text="Show this logo in the partners strip on the home page.")

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
    logo = OptimizedImageField(upload_to="collaborations/", blank=True)
    link = models.URLField(blank=True, verbose_name="Website / link")
    latitude = models.FloatField(null=True, blank=True, help_text="Position on the map. Use the 'Fill coordinates from country' action, or enter manually.")
    longitude = models.FloatField(null=True, blank=True)

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
    image = OptimizedImageField(upload_to="projects/", blank=True)
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

    # ---- full article page (all optional; the page appears when an abstract or sections exist) ----
    CONTENT_TYPES = [("research", _("Research")), ("review", _("Review")), ("case_study", _("Case study")),
                     ("short_report", _("Short report")), ("other", _("Article"))]
    slug = models.SlugField(max_length=140, unique=True, null=True, blank=True, help_text="Auto-filled from the title.")
    content_type = models.CharField(max_length=20, choices=CONTENT_TYPES, default="research")
    open_access = models.BooleanField(default=True)
    published_date = models.DateField(null=True, blank=True)
    received_date = models.DateField(null=True, blank=True)
    accepted_date = models.DateField(null=True, blank=True)
    volume = models.CharField(max_length=20, blank=True)
    issue = models.CharField(max_length=20, blank=True)
    article_number = models.CharField(max_length=20, blank=True)
    publisher = models.CharField(max_length=120, blank=True)
    issn = models.CharField(max_length=20, blank=True)
    license = models.CharField(max_length=60, blank=True, help_text="e.g. CC BY 4.0")
    license_url = models.URLField(blank=True)
    keywords = models.CharField(max_length=300, blank=True, help_text="Comma separated.")
    subjects = models.CharField(max_length=300, blank=True, help_text="Comma separated. Shown as related subjects.")
    abstract = models.TextField(blank=True, help_text="Use this for an unstructured abstract.")
    abstract_background = models.TextField(blank=True)
    abstract_methods = models.TextField(blank=True)
    abstract_results = models.TextField(blank=True)
    abstract_conclusion = models.TextField(blank=True)
    rights_text = models.TextField(blank=True, help_text="Rights and permissions statement.")
    accesses = models.PositiveIntegerField(null=True, blank=True)
    citations = models.PositiveIntegerField(null=True, blank=True)
    altmetric = models.PositiveIntegerField(null=True, blank=True)
    mentions = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-year", "order", "title"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug and (self.abstract or self.abstract_background or self.pk and self.sections.exists()):
            self.slug = self._make_slug()
        super().save(*args, **kwargs)

    def _make_slug(self):
        base = slugify((getattr(self, "title_en", None) or self.title or "article")[:80]) or "article"
        slug, n = base, 2
        while Publication.objects.filter(slug=slug).exclude(pk=self.pk).exists():
            slug, n = f"{base}-{n}", n + 1
        return slug

    @property
    def has_article(self):
        return bool(self.slug and (self.abstract or self.abstract_background or self.abstract_results or self.sections.exists()))

    def get_absolute_url(self):
        return reverse("article", args=[self.slug]) if self.slug else ""

    @property
    def subject_list(self):
        return [x.strip() for x in self.subjects.split(",") if x.strip()]

    @property
    def keyword_list(self):
        return [x.strip() for x in self.keywords.split(",") if x.strip()]

    @property
    def doi_url(self):
        return f"https://doi.org/{self.doi}" if self.doi else ""

    @property
    def citation_apa(self):
        parts = [self.authors.rstrip(".")]
        parts.append(f"({self.year})" if self.year else "(n.d.)")
        parts.append(self.title_en.rstrip(".") + "." if getattr(self, "title_en", None) else self.title.rstrip(".") + ".")
        if self.journal:
            parts.append(self.journal + ".")
        if self.doi:
            parts.append(self.doi_url)
        return " ".join(parts)

    @property
    def citation_bibtex(self):
        key = (self.authors.split(",")[0].split()[-1] if self.authors else "ref") + str(self.year or "")
        key = "".join(c for c in key if c.isalnum()) or "ref"
        title = getattr(self, "title_en", None) or self.title
        fields = [("title", title), ("author", self.authors.replace(", ", " and ")), ("journal", self.journal),
                  ("year", self.year or ""), ("doi", self.doi)]
        body = ",\n".join(f"  {k} = {{{v}}}" for k, v in fields if v)
        return f"@article{{{key},\n{body}\n}}"


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
    image = OptimizedImageField(upload_to="hub/", blank=True)
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
    registration_link = models.URLField(blank=True, help_text="External link. Leave blank to use the built-in registration form.")
    registration_open = models.BooleanField(default=True)
    capacity = models.PositiveIntegerField(null=True, blank=True, help_text="Maximum seats. Leave blank for unlimited; extra sign-ups go on a waiting list.")
    image = OptimizedImageField(upload_to="training/", blank=True)

    class Meta:
        ordering = ["kind", "order", "-start_date"]

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse("training_register", args=[self.slug])

    @property
    def seats_taken(self):
        return self.registrations.exclude(status__in=["waitlist", "cancelled"]).count()

    @property
    def seats_left(self):
        return None if self.capacity is None else max(self.capacity - self.seats_taken, 0)

    @property
    def is_full(self):
        return self.capacity is not None and self.seats_taken >= self.capacity


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
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_requests")
    email_sent = models.BooleanField(default=False, editable=False)
    confirmation_sent = models.BooleanField(default=False, editable=False)
    crm_status = models.CharField(max_length=12, blank=True, editable=False)
    language = models.CharField(max_length=5, blank=True, editable=False)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created"]

    def __str__(self):
        return f"{self.get_request_type_display()} - {self.name}"


class Post(SEOMixin, Published, SlugMixin):
    """News / blog articles."""

    title = models.CharField(max_length=200)
    summary = models.CharField(max_length=300, blank=True)
    body = models.TextField()
    image = OptimizedImageField(upload_to="news/", blank=True)
    author_name = models.CharField(max_length=120, blank=True)
    published_at = models.DateField(default=timezone.localdate, help_text="Shown on the post and used for ordering.")

    class Meta:
        ordering = ["-published_at", "-created"]

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse("post", args=[self.slug])


class NewsletterSubscriber(models.Model):
    email = models.EmailField(unique=True)
    language = models.CharField(max_length=5, blank=True)
    is_active = models.BooleanField(default=True)
    crm_status = models.CharField(max_length=12, blank=True, editable=False)
    token = models.CharField(max_length=40, unique=True, editable=False, default=secrets.token_urlsafe)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created"]

    def __str__(self):
        return self.email


class TrainingRegistration(models.Model):
    STATUS = [("pending", _("Pending")), ("confirmed", _("Confirmed")), ("waitlist", _("Waiting list")), ("cancelled", _("Cancelled"))]
    program = models.ForeignKey(TrainingProgram, on_delete=models.CASCADE, related_name="registrations")
    name = models.CharField(_("Name"), max_length=120)
    email = models.EmailField(_("Email"))
    organization = models.CharField(_("Organization"), max_length=200, blank=True)
    phone = models.CharField(_("Phone"), max_length=40, blank=True)
    message = models.TextField(_("Notes (optional)"), blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default="pending")
    crm_status = models.CharField(max_length=12, blank=True, editable=False)
    language = models.CharField(max_length=5, blank=True, editable=False)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created"]
        constraints = [models.UniqueConstraint(fields=["program", "email"], name="one_registration_per_email")]

    def __str__(self):
        return f"{self.name} - {self.program}"


class ArticleAuthor(models.Model):
    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name="author_list")
    name = models.CharField(max_length=140, help_text="Full name as displayed.")
    given_name = models.CharField(max_length=80, blank=True, help_text="Optional, for correct citations.")
    family_name = models.CharField(max_length=80, blank=True, help_text="Optional, for correct citations.")
    affiliation = models.CharField(max_length=300, blank=True)
    corresponding = models.BooleanField(default=False)
    email = models.EmailField(blank=True)
    orcid = models.CharField(max_length=19, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.name

    @property
    def family(self):
        return self.family_name or self.name.split()[-1]

    @property
    def given(self):
        if self.given_name:
            return self.given_name
        return " ".join(self.name.split()[:-1]) if not self.family_name else self.name.replace(self.family_name, "").strip()

    @property
    def initials(self):
        return " ".join(f"{p[0]}." for p in self.given.replace("-", " ").split() if p)


class ArticleSection(models.Model):
    KINDS = [
        ("background", _("Background")), ("methods", _("Methods")), ("results", _("Results")), ("conclusion", _("Conclusion")),
        ("introduction", _("Introduction")), ("methodology", _("Methodology")), ("discussion", _("Discussion")),
        ("limitations", _("Limitations")), ("conclusions", _("Conclusions")), ("data_availability", _("Data availability")),
        ("author_info", _("Author information")), ("ethics", _("Ethics declarations")), ("other", _("Other section")),
    ]
    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name="sections")
    kind = models.CharField(max_length=20, choices=KINDS)
    heading = models.CharField(max_length=160, blank=True, help_text="Leave blank to use the standard title.")
    body = models.TextField(help_text="Blank line = new paragraph. '### Title' = sub-heading. '- item' = bullet. [12] links to reference 12. [[fig:1]] / [[table:1]] place a figure or table.")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.publication_id}: {self.heading or self.get_kind_display()}"

    @property
    def title(self):
        return self.heading or self.get_kind_display()

    @property
    def anchor(self):
        return slugify(self.title) or self.kind


class ArticleFigure(models.Model):
    KINDS = [("figure", _("Figure")), ("table", _("Table"))]
    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name="figures")
    kind = models.CharField(max_length=10, choices=KINDS, default="figure")
    number = models.PositiveIntegerField(default=1)
    label = models.CharField(max_length=20, blank=True, help_text="e.g. Fig. 1 or Table 1")
    caption = models.CharField(max_length=500, blank=True)
    image = OptimizedImageField(upload_to="articles/", blank=True)
    table_html = models.TextField(blank=True, help_text="HTML <table> for tables.")
    note = models.CharField(max_length=500, blank=True, help_text="Footnote under the figure/table.")

    class Meta:
        ordering = ["kind", "number"]

    def __str__(self):
        return self.label or f"{self.kind} {self.number}"


class ArticleReference(models.Model):
    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name="references")
    number = models.PositiveIntegerField()
    text = models.TextField(help_text="Full reference as printed.")
    authors = models.CharField(max_length=500, blank=True)
    title = models.CharField(max_length=500, blank=True)
    source = models.CharField(max_length=300, blank=True, help_text="Journal / publisher and year.")
    doi = models.CharField(max_length=120, blank=True)
    url = models.URLField(max_length=600, blank=True)

    class Meta:
        ordering = ["number"]
        constraints = [models.UniqueConstraint(fields=["publication", "number"], name="unique_ref_number")]

    def __str__(self):
        return f"[{self.number}] {self.text[:60]}"

    @property
    def scholar_url(self):
        from urllib.parse import quote_plus

        return "https://scholar.google.com/scholar_lookup?title=" + quote_plus((self.title or self.text)[:200])

    @property
    def article_url(self):
        return f"https://doi.org/{self.doi}" if self.doi else self.url


class ArticleLink(models.Model):
    KINDS = [("similar", _("Similar content")), ("related", _("Related subject / link"))]
    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name="links")
    kind = models.CharField(max_length=10, choices=KINDS, default="similar")
    title = models.CharField(max_length=300)
    url = models.URLField()
    source = models.CharField(max_length=160, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


class Metric(Published):
    """Impact numbers shown on the home page (studies, participants, countries...)."""

    label = models.CharField(max_length=80)
    value = models.PositiveIntegerField()
    suffix = models.CharField(max_length=8, blank=True, help_text="e.g. + or %")

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.label}: {self.value}"


# ---- Student portal -----------------------------------------------------------------------------
def private_storage():
    from django.core.files.storage import FileSystemStorage

    class PrivateStorage(FileSystemStorage):
        def url(self, name):  # served by core.portal.download (permission checked)
            return "/portal-files/" + str(name).replace("\\", "/")

    return PrivateStorage(location=str(settings.PRIVATE_MEDIA_ROOT))


class StatusNotify(models.Model):
    """Remembers the status loaded from the database and calls `on_status_change` after a real change."""

    class Meta:
        abstract = True

    _orig_status = None

    @classmethod
    def from_db(cls, db, field_names, values):
        obj = super().from_db(db, field_names, values)
        obj._orig_status = obj.status
        return obj

    def save(self, *args, **kwargs):
        changed = self._orig_status is not None and self._orig_status != self.status
        super().save(*args, **kwargs)
        self._orig_status = self.status
        if changed:
            self.on_status_change()

    def on_status_change(self):
        pass


class StudentProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="student")
    university = models.CharField(_("University / organization"), max_length=200, blank=True)
    field_of_study = models.CharField(_("Field of study"), max_length=160, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    language = models.CharField(max_length=5, blank=True)
    email_verified = models.BooleanField(_("Email verified"), default=False)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created"]

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        return self.user.get_full_name() or self.user.email or self.user.username


class Enrollment(StatusNotify):
    STATUS = [("pending", _("Pending")), ("approved", _("Approved")), ("waitlist", _("Waiting list")), ("completed", _("Completed")),
              ("rejected", _("Rejected")), ("cancelled", _("Cancelled"))]
    ACTIVE = ("approved", "completed")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="enrollments")
    program = models.ForeignKey(TrainingProgram, on_delete=models.CASCADE, related_name="enrollments")
    status = models.CharField(max_length=12, choices=STATUS, default="pending")
    note = models.TextField(_("Message to the student"), blank=True)
    registration = models.OneToOneField(TrainingRegistration, null=True, blank=True, on_delete=models.SET_NULL, editable=False, related_name="enrollment")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created"]
        constraints = [models.UniqueConstraint(fields=["student", "program"], name="one_enrollment_per_student_program")]

    def __str__(self):
        return f"{self.student} - {self.program}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        reg = self.registration
        if reg:  # keep the public registration list in step
            new = {"pending": "pending", "approved": "confirmed", "completed": "confirmed", "waitlist": "waitlist"}.get(self.status, "cancelled")
            if reg.status != new:
                reg.status = new
                reg.save(update_fields=["status"])

    def on_status_change(self):
        from . import portal

        portal.notify_enrollment(self)


class CourseMaterial(models.Model):
    program = models.ForeignKey(TrainingProgram, on_delete=models.CASCADE, related_name="materials")
    title = models.CharField(max_length=200)
    description = models.CharField(max_length=300, blank=True)
    file = models.FileField(upload_to="materials/", storage=private_storage, blank=True, help_text="Only approved students can download this file.")
    link = models.URLField(blank=True, help_text="Or link to a video / external page.")
    order = models.PositiveIntegerField(default=0, help_text="Lower numbers appear first.")
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


class ProjectRequest(StatusNotify):
    STATUS = [("draft", _("Draft")), ("submitted", _("Submitted")), ("in_review", _("In review")), ("approved", _("Approved")),
              ("running", _("Running")), ("completed", _("Completed")), ("rejected", _("Rejected"))]
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="project_requests")
    title = models.CharField(max_length=200)
    summary = models.TextField(help_text="What is the research question and what do you plan to do?")
    research_area = models.ForeignKey(ResearchArea, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    supervisor = models.CharField(_("Preferred supervisor"), max_length=160, blank=True)
    attachment = models.FileField(upload_to="requests/", storage=private_storage, blank=True, help_text="Optional: proposal or outline (PDF, Word, ZIP, image; max 10 MB).")
    status = models.CharField(max_length=12, choices=STATUS, default="draft")
    review_note = models.TextField(_("Message to the student"), blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    project = models.OneToOneField(Project, null=True, blank=True, on_delete=models.SET_NULL, editable=False, related_name="request")
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated"]

    def __str__(self):
        return self.title

    @property
    def editable(self):
        return self.status in ("draft", "rejected")

    def on_status_change(self):
        from . import portal

        portal.notify_project(self)


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    text = models.CharField(max_length=300)
    url = models.CharField(max_length=200, blank=True)
    read = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created"]

    def __str__(self):
        return self.text


# ---- CMS labels: apply lazy translations to field names, help texts and model names -------------
from django.utils.functional import Promise  # noqa: E402

from .admin_labels import FIELDS as _FIELD_LABELS, HELP as _HELP, MODELS as _MODEL_NAMES  # noqa: E402


def _localize_models():
    for model in (v for v in globals().values() if isinstance(v, type) and issubclass(v, models.Model) and v is not models.Model
                  and not v._meta.abstract and v.__module__ == __name__):
        for f in list(model._meta.local_fields) + list(model._meta.local_many_to_many):
            if not isinstance(f.verbose_name, Promise):
                default = f.name.replace("_", " ")
                text = f.verbose_name
                if text == default and f.name in _FIELD_LABELS:
                    text = _FIELD_LABELS[f.name][0]
                f.verbose_name = _(text)
            if f.help_text and not isinstance(f.help_text, Promise):
                f.help_text = _(str(f.help_text))
        names = _MODEL_NAMES.get(model.__name__)
        if names:
            model._meta.verbose_name = _(names[0])
            model._meta.verbose_name_plural = _(names[1])


_localize_models()
