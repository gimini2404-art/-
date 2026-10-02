from django import forms

from .models import ContactRequest, NewsletterSubscriber, TrainingRegistration


class ContactForm(forms.ModelForm):
    website = forms.CharField(label="Website", required=False, widget=forms.TextInput(attrs={"tabindex": "-1", "autocomplete": "off"}))  # honeypot

    class Meta:
        model = ContactRequest
        fields = ["request_type", "name", "email", "organization", "subject", "message"]
        widgets = {"message": forms.Textarea(attrs={"rows": 6})}

    def clean_website(self):
        if self.cleaned_data.get("website"):
            raise forms.ValidationError("Spam detected.")
        return ""


class _Honeypot(forms.Form):
    pass


class TrainingRegistrationForm(forms.ModelForm):
    website = forms.CharField(label="Website", required=False, widget=forms.TextInput(attrs={"tabindex": "-1", "autocomplete": "off"}))

    class Meta:
        model = TrainingRegistration
        fields = ["name", "email", "organization", "phone", "message"]
        widgets = {"message": forms.Textarea(attrs={"rows": 4})}

    def clean_website(self):
        if self.cleaned_data.get("website"):
            raise forms.ValidationError("Spam detected.")
        return ""


class NewsletterForm(forms.ModelForm):
    website = forms.CharField(required=False)  # honeypot

    class Meta:
        model = NewsletterSubscriber
        fields = ["email"]

    def clean_email(self):
        return self.cleaned_data["email"].strip().lower()

    def clean_website(self):
        if self.cleaned_data.get("website"):
            raise forms.ValidationError("Spam detected.")
        return ""

    def validate_unique(self):  # existing subscribers are handled in the view (idempotent)
        pass


# ---- Student portal -------------------------------------------------------------------------
from django.contrib.auth import get_user_model  # noqa: E402
from django.core.files.uploadedfile import UploadedFile  # noqa: E402
from django.contrib.auth.forms import AuthenticationForm, PasswordChangeForm  # noqa: E402
from django.contrib.auth.password_validation import validate_password  # noqa: E402
from django.utils.translation import gettext_lazy as _  # noqa: E402

from .models import ProjectRequest, StudentProfile  # noqa: E402

User = get_user_model()
ALLOWED_UPLOADS = (".pdf", ".doc", ".docx", ".zip", ".png", ".jpg", ".jpeg", ".txt")
MAX_UPLOAD = 10 * 1024 * 1024


class SignupForm(forms.Form):
    full_name = forms.CharField(label=_("Full name"), max_length=120)
    email = forms.EmailField(label=_("Email"))
    university = forms.CharField(label=_("University / organization"), max_length=200, required=False)
    password1 = forms.CharField(label=_("Password"), widget=forms.PasswordInput(attrs={"autocomplete": "new-password"}))
    password2 = forms.CharField(label=_("Confirm password"), widget=forms.PasswordInput(attrs={"autocomplete": "new-password"}))
    website = forms.CharField(label="Website", required=False, widget=forms.TextInput(attrs={"tabindex": "-1", "autocomplete": "off"}))  # honeypot

    def clean_website(self):
        if self.cleaned_data.get("website"):
            raise forms.ValidationError("Spam detected.")
        return ""

    def clean_email(self):
        email = self.cleaned_data["email"].strip().lower()
        if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError(_("An account with this email already exists. Try signing in."))
        return email

    def clean(self):
        data = super().clean()
        p1, p2 = data.get("password1"), data.get("password2")
        if p1 and p2 and p1 != p2:
            self.add_error("password2", _("The two passwords do not match."))
        elif p1:
            try:
                validate_password(p1)
            except forms.ValidationError as e:
                self.add_error("password1", e)
        return data


class LoginForm(AuthenticationForm):
    username = forms.CharField(label=_("Email"), widget=forms.TextInput(attrs={"autofocus": True, "autocomplete": "username", "dir": "ltr"}))
    password = forms.CharField(label=_("Password"), strip=False, widget=forms.PasswordInput(attrs={"autocomplete": "current-password"}))
    error_messages = {"invalid_login": _("Incorrect email or password."), "inactive": _("This account is inactive.")}

    def clean_username(self):
        return self.cleaned_data["username"].strip().lower()


class ProfileForm(forms.ModelForm):
    full_name = forms.CharField(label=_("Full name"), max_length=120)

    class Meta:
        model = StudentProfile
        fields = ["university", "field_of_study", "phone", "language"]
        widgets = {"language": forms.Select(choices=[("", "—"), ("en", "English"), ("ar", "العربية")])}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["full_name"].initial = self.instance.user.get_full_name()
        self.order_fields(["full_name", "university", "field_of_study", "phone", "language"])

    def save(self, commit=True):
        obj = super().save(commit)
        first, _s, last = self.cleaned_data["full_name"].strip().partition(" ")
        obj.user.first_name, obj.user.last_name = first, last
        obj.user.save(update_fields=["first_name", "last_name"])
        return obj


class ProjectRequestForm(forms.ModelForm):
    class Meta:
        model = ProjectRequest
        fields = ["title", "summary", "research_area", "supervisor", "attachment"]
        widgets = {"summary": forms.Textarea(attrs={"rows": 8})}

    def clean_attachment(self):
        f = self.cleaned_data.get("attachment")
        if isinstance(f, UploadedFile):
            if not f.name.lower().endswith(ALLOWED_UPLOADS):
                raise forms.ValidationError(_("Unsupported file type. Use PDF, Word, ZIP, image or text."))
            if f.size > MAX_UPLOAD:
                raise forms.ValidationError(_("The file is larger than 10 MB."))
        return f
