"""Student portal: accounts, course enrolment, project requests, notifications, private downloads."""
import mimetypes
from functools import wraps

from django.contrib import messages
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth import views as auth_views
from django.contrib.auth.forms import PasswordChangeForm
from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse, reverse_lazy
from django.utils import timezone, translation
from django.utils.translation import gettext as _
from django.views.decorators.http import require_POST

from . import emails
from . import models as m
from .forms import LoginForm, ProfileForm, ProjectRequestForm, SignupForm
from .security import client_ip, guard, rate_limited

User = get_user_model()
VERIFY_SALT = "sianexis.verify"
VERIFY_MAX_AGE = 60 * 60 * 24 * 3


# ------------------------------------------------------------------ helpers
def profile_of(user):
    prof, _c = m.StudentProfile.objects.get_or_create(user=user, defaults={"email_verified": user.is_staff})
    return prof


def notify(user, text, url="", email_subject=None, email_body=None):
    """In-site notification (+ email in the student's language)."""
    m.Notification.objects.create(user=user, text=text[:300], url=url)
    if user.email and email_subject:
        emails.send_safe(email_subject, (email_body or text), user.email)


def _in_lang(user, fn):
    """Run fn() with the student's own language active (for notification texts)."""
    lang = getattr(getattr(user, "student", None), "language", "") or translation.get_language() or "en"
    with translation.override(lang):
        return fn()


def notify_enrollment(enr):
    def build():
        label = enr.get_status_display()
        text = _("Your enrollment in %(program)s is now: %(status)s") % {"program": enr.program.title, "status": label}
        body = text + (("\n\n" + enr.note) if enr.note else "") + "\n\n" + _("Best regards,") + "\nSiaNexis"
        return text, _("Course enrollment update - SiaNexis"), body
    text, subject, body = _in_lang(enr.student, build)
    notify(enr.student, text, reverse("portal_course", args=[enr.program.slug]), subject, body)


def notify_project(req):
    def build():
        label = req.get_status_display()
        text = _('Your project request "%(title)s" is now: %(status)s') % {"title": req.title, "status": label}
        body = text + (("\n\n" + req.review_note) if req.review_note else "") + "\n\n" + _("Best regards,") + "\nSiaNexis"
        return text, _("Project request update - SiaNexis"), body
    text, subject, body = _in_lang(req.student, build)
    notify(req.student, text, reverse("portal_project", args=[req.pk]), subject, body)


def verify_token(user):
    return signing.dumps(user.pk, salt=VERIFY_SALT)


def send_verification(request, user):
    link = request.build_absolute_uri(reverse("portal_verify", args=[verify_token(user)]))
    return emails.send_safe(
        _("Confirm your email - SiaNexis"),
        _("Dear %(name)s,") % {"name": user.get_full_name() or user.email} + "\n\n"
        + _("Please confirm your email address to activate your student account:") + "\n" + link + "\n\n"
        + _("The link is valid for 3 days.") + "\n\n" + _("Best regards,") + "\nSiaNexis",
        user.email,
    )


def student_required(view):
    """Login + verified email. Unverified users are sent to the 'confirm your email' page."""
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return redirect(f"{reverse('portal_login')}?next={request.get_full_path()}")
        prof = profile_of(request.user)
        if not prof.email_verified:
            return redirect("portal_verify_pending")
        request.student = prof
        return view(request, *args, **kwargs)
    return wrapper


# ------------------------------------------------------------------ accounts
def signup(request):
    if request.user.is_authenticated and not request.user.is_staff:
        return redirect("portal_dashboard")
    form = SignupForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        blocked = guard(request, "signup", 8)
        if blocked:
            form.add_error(None, blocked)
        else:
            d = form.cleaned_data
            first, _s, last = d["full_name"].strip().partition(" ")
            user = User.objects.create_user(username=d["email"], email=d["email"], password=d["password1"], first_name=first, last_name=last)
            m.StudentProfile.objects.create(user=user, university=d["university"], language=translation.get_language() or "")
            login(request, user)
            send_verification(request, user)
            messages.success(request, _("Account created. We sent you an email to confirm your address."))
            return redirect("portal_verify_pending")
    return render(request, "core/portal/signup.html", {"form": form})


class PortalLogin(auth_views.LoginView):
    template_name = "core/portal/login.html"
    authentication_form = LoginForm
    redirect_authenticated_user = True
    MAX_FAILURES = 15  # per IP per hour

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx.pop("site", None)  # LoginView injects a Sites object that would hide our SiteSettings `site`
        ctx.pop("site_name", None)
        return ctx

    def post(self, request, *args, **kwargs):
        if cache.get(self._key(), 0) >= self.MAX_FAILURES:
            form = self.get_form()
            form.is_valid()
            form.errors.clear()
            form.add_error(None, _("Too many requests. Please try again later."))
            return self.render_to_response(self.get_context_data(form=form))
        return super().post(request, *args, **kwargs)

    def _key(self):
        return f"login-fail:{client_ip(self.request)}"

    def form_invalid(self, form):
        cache.add(self._key(), 0, 3600)
        try:
            cache.incr(self._key())
        except ValueError:
            cache.set(self._key(), 1, 3600)
        return super().form_invalid(form)


@require_POST
def signout(request):
    logout(request)
    return redirect("home")


def verify_pending(request):
    if not request.user.is_authenticated:
        return redirect("portal_login")
    if profile_of(request.user).email_verified:
        return redirect("portal_dashboard")
    return render(request, "core/portal/verify_pending.html")


@require_POST
def verify_resend(request):
    if not request.user.is_authenticated:
        return redirect("portal_login")
    if rate_limited(request, "verify-resend", 5):
        messages.error(request, _("Too many requests. Please try again later."))
    else:
        send_verification(request, request.user)
        messages.success(request, _("We sent you a new confirmation email."))
    return redirect("portal_verify_pending")


def verify(request, token):
    try:
        pk = signing.loads(token, salt=VERIFY_SALT, max_age=VERIFY_MAX_AGE)
        user = User.objects.get(pk=pk)
    except (signing.BadSignature, User.DoesNotExist):
        return render(request, "core/portal/verify_failed.html", status=400)
    prof = profile_of(user)
    if not prof.email_verified:
        prof.email_verified = True
        prof.save(update_fields=["email_verified"])
        notify(user, _("Welcome to SiaNexis! Your email is confirmed."), reverse("portal_dashboard"))
    if not request.user.is_authenticated:
        messages.success(request, _("Your email is confirmed. Please sign in."))
        return redirect("portal_login")
    messages.success(request, _("Your email is confirmed."))
    return redirect("portal_dashboard")


class Reset(auth_views.PasswordResetView):
    template_name = "core/portal/password_reset.html"
    email_template_name = "core/portal/password_reset_email.txt"
    subject_template_name = "core/portal/password_reset_subject.txt"
    success_url = reverse_lazy("portal_password_reset_done")


class ResetDone(auth_views.PasswordResetDoneView):
    template_name = "core/portal/password_reset_done.html"


class ResetConfirm(auth_views.PasswordResetConfirmView):
    template_name = "core/portal/password_reset_confirm.html"
    success_url = reverse_lazy("portal_password_reset_complete")


class ResetComplete(auth_views.PasswordResetCompleteView):
    template_name = "core/portal/password_reset_complete.html"


# ------------------------------------------------------------------ dashboard
@student_required
def dashboard(request):
    u = request.user
    return render(request, "core/portal/dashboard.html", {
        "section": "dashboard",
        "enrollments": u.enrollments.select_related("program")[:5],
        "requests": u.project_requests.all()[:5],
        "notifications": u.notifications.all()[:6],
        "counts": {"courses": u.enrollments.filter(status__in=m.Enrollment.ACTIVE).count(),
                   "projects": u.project_requests.count(),
                   "pending": u.enrollments.filter(status="pending").count() + u.project_requests.filter(status__in=["submitted", "in_review"]).count()},
    })


@student_required
def courses(request):
    return render(request, "core/portal/courses.html", {"section": "courses", "enrollments": request.user.enrollments.select_related("program")})


@student_required
def course(request, slug):
    enr = get_object_or_404(request.user.enrollments.select_related("program"), program__slug=slug)
    materials = enr.program.materials.all() if enr.status in m.Enrollment.ACTIVE else []
    return render(request, "core/portal/course.html", {"section": "courses", "enr": enr, "program": enr.program, "materials": materials})


@student_required
@require_POST
def enroll(request, slug):
    program = get_object_or_404(m.TrainingProgram.objects.filter(m.live_filter()), slug=slug)
    if not program.registration_open or program.registration_link:
        messages.error(request, _("Registration is closed for this program."))
        return redirect("training_register", slug=slug)
    u = request.user
    enr, created = m.Enrollment.objects.get_or_create(student=u, program=program)
    if created:
        email = u.email.lower()
        reg = m.TrainingRegistration.objects.filter(program=program, email__iexact=email).first()
        if not reg:
            reg = m.TrainingRegistration.objects.create(
                program=program, name=u.get_full_name() or email, email=email, organization=request.student.university,
                phone=request.student.phone, language=translation.get_language() or "", status="waitlist" if program.is_full else "pending")
        enr.registration = reg
        if reg.status == "waitlist":
            enr.status = "waitlist"
        enr.save()
        notify(u, _("We received your enrollment request for %(program)s.") % {"program": program.title}, reverse("portal_course", args=[slug]))
        messages.success(request, _("Your enrollment request was sent. We will review it soon.")
                         if enr.status != "waitlist" else _("The program is full. You were added to the waiting list."))
    else:
        messages.info(request, _("You are already enrolled in this program."))
    return redirect("portal_course", slug=slug)


@student_required
@require_POST
def cancel_enrollment(request, slug):
    enr = get_object_or_404(request.user.enrollments, program__slug=slug)
    if enr.status in ("pending", "waitlist", "approved"):
        enr.status = "cancelled"
        enr.save()
        messages.success(request, _("Your enrollment was cancelled."))
    return redirect("portal_courses")


# ------------------------------------------------------------------ project requests
@student_required
def projects(request):
    return render(request, "core/portal/projects.html", {"section": "projects", "requests": request.user.project_requests.all()})


def _save_request(request, instance=None):
    form = ProjectRequestForm(request.POST or None, request.FILES or None, instance=instance)
    if request.method == "POST" and form.is_valid():
        obj = form.save(commit=False)
        obj.student = request.user
        submit = "submit" in request.POST
        if submit:
            obj.status, obj.submitted_at = "submitted", timezone.now()
        elif obj.pk is None:
            obj.status = "draft"
        obj.save()
        if submit:
            notify(request.user, _('Your project request "%(title)s" was submitted for review.') % {"title": obj.title}, reverse("portal_project", args=[obj.pk]))
            emails.send_safe(_("New student project request"), f"{obj.title}\n{request.user.get_full_name()} <{request.user.email}>\n\n{obj.summary}",
                             settings.CONTACT_EMAIL)
            messages.success(request, _("Your request was submitted. We will review it and reply here."))
        else:
            messages.success(request, _("Draft saved."))
        return None, redirect("portal_project", pk=obj.pk)
    return form, None


@student_required
def project_new(request):
    form, done = _save_request(request)
    return done or render(request, "core/portal/project_form.html", {"section": "projects", "form": form, "obj": None})


@student_required
def project(request, pk):
    obj = get_object_or_404(request.user.project_requests.select_related("research_area"), pk=pk)
    form = None
    if obj.editable and request.method == "POST":
        form, done = _save_request(request, obj)
        if done:
            return done
    elif obj.editable and request.GET.get("edit"):
        form = ProjectRequestForm(instance=obj)
    return render(request, "core/portal/project.html", {"section": "projects", "obj": obj, "form": form})


@student_required
@require_POST
def project_delete(request, pk):
    obj = get_object_or_404(request.user.project_requests, pk=pk, status="draft")
    obj.delete()
    messages.success(request, _("Draft deleted."))
    return redirect("portal_projects")


# ------------------------------------------------------------------ profile & notifications
@student_required
def profile(request):
    form = ProfileForm(request.POST or None, instance=request.student, prefix="p")
    pform = PasswordChangeForm(request.user, request.POST if "old_password" in request.POST else None, prefix="pw")
    if request.method == "POST":
        if "old_password" in request.POST and pform.is_valid():
            from django.contrib.auth import update_session_auth_hash

            update_session_auth_hash(request, pform.save())
            messages.success(request, _("Password changed."))
            return redirect("portal_profile")
        if "old_password" not in request.POST and form.is_valid():
            form.save()
            messages.success(request, _("Profile saved."))
            return redirect("portal_profile")
    return render(request, "core/portal/profile.html", {"section": "profile", "form": form, "pform": pform})


@student_required
def notifications(request):
    items = list(request.user.notifications.all()[:50])
    request.user.notifications.filter(read=False).update(read=True)
    return render(request, "core/portal/notifications.html", {"section": "notifications", "items": items})


# ------------------------------------------------------------------ private files
def download(request, name):
    """Serve a private upload only to its owner / staff (project attachments) or approved students (course materials)."""
    if not request.user.is_authenticated:
        return redirect(f"{reverse('portal_login')}?next={request.path}")
    allowed = False
    obj = m.ProjectRequest.objects.filter(attachment=name).first()
    if obj:
        allowed = request.user.is_staff or obj.student_id == request.user.pk
        f = obj.attachment
    else:
        mat = m.CourseMaterial.objects.filter(file=name).select_related("program").first()
        if not mat:
            raise Http404
        allowed = request.user.is_staff or mat.program.enrollments.filter(student=request.user, status__in=m.Enrollment.ACTIVE).exists()
        f = mat.file
    if not allowed:
        raise Http404
    try:
        resp = FileResponse(f.open("rb"), as_attachment=True, filename=name.rsplit("/", 1)[-1])
    except FileNotFoundError:
        raise Http404
    resp["Content-Type"] = mimetypes.guess_type(name)[0] or "application/octet-stream"
    resp["X-Content-Type-Options"] = "nosniff"
    return resp
