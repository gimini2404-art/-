from django import forms

from .models import ContactRequest


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
