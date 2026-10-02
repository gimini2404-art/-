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
