import datetime
import io
import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail, signing
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image

from . import crm, geo, models as m, security


def png(w=3000, h=2000, mode="RGB"):
    buf = io.BytesIO()
    Image.new(mode, (w, h), "red").save(buf, "PNG")
    return SimpleUploadedFile("pic.png", buf.getvalue(), content_type="image/png")


class Base(TestCase):
    def setUp(self):
        cache.clear()
        self.area = m.ResearchArea.objects.create(title_en="Psychiatry", title_ar="الطب النفسي", summary_en="s")
        cat = m.ServiceCategory.objects.create(title_en="Research Services", title_ar="الخدمات البحثية")
        m.Service.objects.create(category=cat, title_en="Study design", title_ar="تصميم الدراسات")


@override_settings(FORM_PROTECTION=False)
class PagesTests(Base):
    def test_public_pages_render_in_both_languages(self):
        for lang in ("en", "ar"):
            for name in ["home", "about", "research_areas", "services", "hub", "collaborations", "projects", "publications",
                         "training", "opportunities", "posts", "contact", "search"]:
                r = self.client.get(self._url(lang, name))
                self.assertEqual(r.status_code, 200, (lang, name))

    def _url(self, lang, name):
        from django.utils import translation
        with translation.override(lang):
            return reverse(name)

    def test_arabic_is_rtl_with_arabic_text(self):
        html = self.client.get("/ar/").content.decode()
        self.assertIn('dir="rtl"', html)
        self.assertIn("الطب النفسي", html)
        self.assertIn("المجالات البحثية", html)

    def test_root_redirects_to_language_prefix(self):
        self.assertEqual(self.client.get("/").status_code, 302)

    def test_sitemap_and_robots(self):
        self.assertEqual(self.client.get("/sitemap.xml").status_code, 200)
        self.assertIn("Sitemap:", self.client.get("/robots.txt").content.decode())


class SchedulingTests(Base):
    def make(self, **kw):
        return m.Post.objects.create(title_en="News", body_en="b", published_at=datetime.date.today(), **kw)

    def test_states(self):
        now = timezone.now()
        self.assertEqual(self.make().state, "live")
        self.assertEqual(self.make(is_published=False).state, "draft")
        self.assertEqual(self.make(publish_at=now + datetime.timedelta(days=1)).state, "scheduled")
        self.assertEqual(self.make(unpublish_at=now - datetime.timedelta(days=1)).state, "expired")

    def test_hidden_from_public_but_previewable_by_staff(self):
        p = self.make(publish_at=timezone.now() + datetime.timedelta(days=2))
        self.assertEqual(self.client.get(p.get_absolute_url()).status_code, 404)
        self.assertNotIn(p.get_absolute_url(), self.client.get("/en/news/").content.decode())
        staff = get_user_model().objects.create_user("s", "s@x.com", "pw", is_staff=True)
        self.client.force_login(staff)
        r = self.client.get(p.get_absolute_url())
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, "Preview mode")


@override_settings(FORM_PROTECTION=False)
class ContactTests(Base):
    def post(self, **kw):
        data = {"request_type": "training", "name": "Ali", "email": "ali@example.com", "message": "Hello", "website": ""}
        data.update(kw)
        return self.client.post("/en/contact/", data)

    def test_saved_and_emails_sent(self):
        r = self.post()
        self.assertRedirects(r, "/en/contact/thanks/")
        obj = m.ContactRequest.objects.get()
        self.assertTrue(obj.confirmation_sent and obj.email_sent)
        self.assertEqual(len(mail.outbox), 2)  # staff notification + auto reply
        self.assertEqual(mail.outbox[1].to, ["ali@example.com"])

    def test_arabic_auto_reply(self):
        self.client.post("/ar/contact/", {"request_type": "other", "name": "علي", "email": "a@example.com", "message": "مرحبا", "website": ""})
        self.assertIn("عزيزي", mail.outbox[-1].body)

    def test_honeypot_blocks_bots(self):
        self.post(website="http://spam")
        self.assertEqual(m.ContactRequest.objects.count(), 0)


class GuardTests(Base):
    def data(self, token):
        return {"request_type": "other", "name": "Ali", "email": "ali@example.com", "message": "Hello", "website": "", "form_token": token}

    def test_too_fast_submission_rejected(self):
        r = self.client.post("/en/contact/", self.data(security.form_token()))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(m.ContactRequest.objects.count(), 0)

    def test_missing_token_rejected(self):
        self.client.post("/en/contact/", self.data(""))
        self.assertEqual(m.ContactRequest.objects.count(), 0)

    def test_valid_token_accepted(self):
        old = signing.dumps(__import__("time").time() - 10, salt=security.SALT)
        r = self.client.post("/en/contact/", self.data(old))
        self.assertEqual(r.status_code, 302)

    def test_rate_limit(self):
        old = signing.dumps(__import__("time").time() - 10, salt=security.SALT)
        codes = [self.client.post("/en/contact/", self.data(old)).status_code for _ in range(7)]
        self.assertEqual(codes[:5], [302] * 5)
        self.assertEqual(codes[5:], [200, 200])
        self.assertEqual(m.ContactRequest.objects.count(), 5)

    @override_settings(CAPTCHA_PROVIDER="hcaptcha", CAPTCHA_SITE_KEY="k", CAPTCHA_SECRET_KEY="s")
    def test_captcha_required_when_configured(self):
        old = signing.dumps(__import__("time").time() - 10, salt=security.SALT)
        self.client.post("/en/contact/", self.data(old))
        self.assertEqual(m.ContactRequest.objects.count(), 0)
        with mock.patch("core.security._captcha_ok", return_value=True):
            self.assertEqual(self.client.post("/en/contact/", self.data(old)).status_code, 302)
        self.assertIn("h-captcha", self.client.get("/en/contact/").content.decode())


@override_settings(FORM_PROTECTION=False)
class TrainingTests(Base):
    def test_capacity_waitlist_and_duplicates(self):
        t = m.TrainingProgram.objects.create(kind="workshop", title_en="W", capacity=1)
        url = t.get_absolute_url()
        self.client.post(url, {"name": "A", "email": "a@x.com", "website": ""})
        self.client.post(url, {"name": "B", "email": "b@x.com", "website": ""})
        r = self.client.post(url, {"name": "A2", "email": "A@x.com", "website": ""})
        self.assertContains(r, "already registered")
        status = dict(m.TrainingRegistration.objects.values_list("email", "status"))
        self.assertEqual(status, {"a@x.com": "pending", "b@x.com": "waitlist"})
        self.assertTrue(t.is_full)


@override_settings(FORM_PROTECTION=False)
class NewsletterAndSearchTests(Base):
    def test_subscribe_is_idempotent_and_normalised(self):
        for _ in range(2):
            self.client.post("/en/newsletter/subscribe/", {"email": "Me@Example.com", "next": "/en/", "website": ""})
        self.assertEqual(list(m.NewsletterSubscriber.objects.values_list("email", flat=True)), ["me@example.com"])

    def test_unsubscribe(self):
        s = m.NewsletterSubscriber.objects.create(email="a@b.com")
        self.client.post(f"/en/newsletter/unsubscribe/{s.token}/")
        s.refresh_from_db()
        self.assertFalse(s.is_active)

    def test_search_both_languages(self):
        self.assertContains(self.client.get("/ar/search/?q=الطب"), "الطب النفسي")
        self.assertContains(self.client.get("/en/search/?q=psych"), "Psychiatry")
        self.assertContains(self.client.get("/en/search/?q=zzzz"), "No results")


class TeamAndMapTests(Base):
    def test_team_slug_page_and_links(self):
        t = m.TeamMember.objects.create(name_en="Dr. Jane Doe", role_en="Lead", orcid="0000-0002-1825-0097")
        self.assertEqual(t.slug, "dr-jane-doe")
        r = self.client.get(t.get_absolute_url())
        self.assertContains(r, "orcid.org/0000-0002-1825-0097")
        self.assertContains(self.client.get("/en/about/"), t.get_absolute_url())

    def test_geo_lookup_and_map_points(self):
        self.assertEqual(geo.locate("Egypt"), (26.8, 30.8))
        self.assertEqual(geo.locate("مصر"), (26.8, 30.8))
        m.Collaboration.objects.create(organization_name_en="Cairo Univ", collaboration_type="academic", latitude=30.0, longitude=31.2)
        r = self.client.get("/en/collaborations/")
        self.assertContains(r, "collab-map")
        self.assertContains(r, "Cairo Univ")

    def test_metrics_replace_default_stats(self):
        m.Metric.objects.create(label_en="Studies", value=42, suffix="+")
        self.assertContains(self.client.get("/en/"), 'data-count="42"')


class ImageTests(TestCase):
    def test_upload_is_resized_and_converted_to_webp(self):
        import tempfile

        with override_settings(MEDIA_ROOT=tempfile.mkdtemp()):
            p = m.Post.objects.create(title_en="T", body_en="b", published_at=datetime.date.today(), image=png())
            self.assertTrue(p.image.name.endswith(".webp"))
            img = Image.open(p.image.path)
            self.assertEqual(img.format, "WEBP")
            self.assertLessEqual(max(img.size), 1600)


class CRMTests(TestCase):
    @override_settings(CRM_WEBHOOK_URL="https://hook.example/x", CRM_WEBHOOK_SECRET="sec", CRM_ASYNC=False)
    def test_webhook_signed_payload_and_status(self):
        obj = m.ContactRequest.objects.create(request_type="other", name="A B", email="a@b.com", message="hi")
        with mock.patch("core.crm.urllib.request.urlopen") as up:
            up.return_value.__enter__.return_value.status = 200
            crm.push("contact_request", obj, {"name": "A B", "email": "a@b.com"})
        req = up.call_args[0][0]
        body = json.loads(req.data)
        self.assertEqual(body["event"], "contact_request")
        self.assertIn("X-sianexis-signature", dict(req.header_items()))
        obj.refresh_from_db()
        self.assertEqual(obj.crm_status, "ok")

    @override_settings(CRM_WEBHOOK_URL="https://hook.example/x", CRM_ASYNC=False)
    def test_failure_is_recorded_not_raised(self):
        obj = m.ContactRequest.objects.create(request_type="other", name="A", email="a@b.com", message="hi")
        with mock.patch("core.crm.urllib.request.urlopen", side_effect=OSError("down")):
            crm.push("contact_request", obj, {"email": "a@b.com"})
        obj.refresh_from_db()
        self.assertEqual(obj.crm_status, "failed")

    @override_settings(CRM_WEBHOOK_URL="", HUBSPOT_TOKEN="")
    def test_disabled_does_nothing(self):
        self.assertFalse(crm.enabled())


class APITests(Base):
    def test_language_and_drafts(self):
        m.ResearchArea.objects.create(title_en="Hidden", is_published=False)
        en = self.client.get("/api/v1/research-areas/").json()
        ar = self.client.get("/api/v1/research-areas/?lang=ar").json()
        self.assertEqual(en["count"], 1)
        self.assertEqual(ar["results"][0]["title"], "الطب النفسي")

    def test_read_only(self):
        self.assertEqual(self.client.post("/api/v1/research-areas/", {}).status_code, 405)

    def test_services_nested(self):
        d = self.client.get("/api/v1/services/?lang=ar").json()
        self.assertEqual(d["results"][0]["services"][0]["title"], "تصميم الدراسات")


class AdminTests(Base):
    def test_admin_pages_and_dashboard(self):
        u = get_user_model().objects.create_superuser("root", "r@x.com", "pw")
        self.client.force_login(u)
        self.assertContains(self.client.get("/admin/"), "Needs attention")
        for model in ("project", "post", "teammember", "collaboration", "metric", "publication", "contactrequest", "trainingregistration"):
            self.assertEqual(self.client.get(f"/admin/core/{model}/").status_code, 200, model)
            self.assertEqual(self.client.get(f"/admin/core/{model}/add/").status_code, 200, model)


SCHOLAR_BIB = """@article{doe2021sample,
  title={Sample article one: effects of {X} on {Y}},
  author={Doe, Jane and Roe, Richard and others},
  journal={Journal of Examples},
  volume={12}, number={3}, pages={1--10},
  year={2021},
  publisher={Example Press}
}
@inproceedings{roe2020second,
  title={Second sample paper},
  author={Roe, Richard},
  booktitle={Proceedings of Sample Conf},
  year={2020},
  doi={https://doi.org/10.1000/abc123}
}"""


class ImportTests(TestCase):
    def test_bibtex_parser(self):
        from .importers import parse_auto

        a, b = parse_auto(SCHOLAR_BIB)
        self.assertEqual(a["title"], "Sample article one: effects of X on Y")
        self.assertEqual(a["authors"], "Jane Doe, Richard Roe et al.")
        self.assertEqual((a["journal"], a["year"], a["kind"]), ("Journal of Examples", 2021, "paper"))
        self.assertEqual((b["doi"], b["journal"]), ("10.1000/abc123", "Proceedings of Sample Conf"))

    def test_csv_parser(self):
        from .importers import parse_auto

        rows = parse_auto("Authors,Title,Publication,Volume,Year\n\"A Author, B Writer\",Great paper,Nature,5,2019\n")
        self.assertEqual(rows[0]["title"], "Great paper")
        self.assertEqual((rows[0]["journal"], rows[0]["year"]), ("Nature", 2019))

    def test_preview_confirm_and_discard_flow(self):
        u = get_user_model().objects.create_superuser("root", "r@x.com", "pw")
        self.client.force_login(u)
        url = reverse("admin:core_publication_import")
        m.Publication.objects.create(title_en="Second sample paper", authors="x", doi="")
        r = self.client.post(url, {"step": "parse", "text": SCHOLAR_BIB})
        self.assertContains(r, "Temporary import session")
        self.assertContains(r, "Already exists")
        self.assertEqual(m.Publication.objects.count(), 1)  # nothing saved by the preview
        self.client.post(url, {"step": "discard"})
        self.assertEqual(m.Publication.objects.count(), 1)
        self.assertNotIn("pub_import", self.client.session)
        self.client.post(url, {"step": "parse", "text": SCHOLAR_BIB})
        self.client.post(url, {"step": "confirm", "pick": ["0"], "kind_0": "paper"})
        self.assertEqual(m.Publication.objects.count(), 2)
        self.assertTrue(m.Publication.objects.filter(title_en__startswith="Sample article one").exists())


import tempfile as _tempfile  # noqa: E402


@override_settings(MEDIA_ROOT=_tempfile.mkdtemp())
class ArticlePageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("load_article")
        cls.pub = m.Publication.objects.get(doi="10.1186/s12910-024-01078-0")

    def test_loader_imported_everything(self):
        p = self.pub
        self.assertEqual((p.references.count(), p.author_list.count(), p.figures.count()), (89, 10, 3))
        self.assertTrue(p.pdf and p.has_article)
        self.assertEqual(p.references.first().number, 1)

    def test_page_structure_and_order(self):
        html = self.client.get(self.pub.get_absolute_url()).content.decode()
        for needle in ("Open access", "Download PDF", "Cite article", "Show authors", "On this page", 'id="abstract"', 'id="references"', 'id="cite"',
                       "citation_title", "ScholarlyArticle", "Journal info", "Rights and permissions"):
            self.assertIn(needle, html, needle)
        pos = lambda anchor: html.index(f'id="{anchor}"')
        order = [pos(a) for a in ("abstract", "introduction", "methodology", "results", "discussion", "references", "author-information", "rights", "cite")]
        self.assertEqual(order, sorted(order))
        self.assertNotIn("Accesses", html.split('class="art-layout"')[0])  # no metrics -> hidden, no empty placeholders

    def test_citations_link_to_references_and_figures_render(self):
        html = self.client.get(self.pub.get_absolute_url()).content.decode()
        self.assertIn('href="#ref-46"', html)
        self.assertIn('id="ref-89"', html)
        self.assertIn('id="figure-1"', html)
        self.assertIn('id="table-1"', html)

    def test_cite_downloads(self):
        ris = self.client.get(f"/en/publications/{self.pub.slug}/cite.ris")
        self.assertEqual(ris.status_code, 200)
        self.assertIn("TY  - JOUR", ris.content.decode())
        self.assertIn("DO  - 10.1186/s12910-024-01078-0", ris.content.decode())
        bib = self.client.get(f"/en/publications/{self.pub.slug}/cite.bib").content.decode()
        self.assertIn("@article{ElDine2024", bib)
        self.assertEqual(self.client.get(f"/en/publications/{self.pub.slug}/cite.zip").status_code, 404)

    def test_apa_citation(self):
        from .article import cite_apa

        apa = cite_apa(self.pub)
        self.assertTrue(apa.startswith("El Dine, F. B., Gebreal, A."))
        self.assertIn("& Ghazy, R. M. (2024).", apa)
        self.assertIn("https://doi.org/10.1186/s12910-024-01078-0", apa)

    def test_arabic_ui_with_ltr_article_text(self):
        html = self.client.get(f"/ar/publications/{self.pub.slug}/").content.decode()
        self.assertIn('dir="rtl"', html)
        self.assertIn("تنزيل PDF", html)
        self.assertIn("المراجع", html)
        self.assertIn('<article class="art-main" lang="en" dir="ltr">', html)

    def test_draft_hidden_from_public(self):
        self.pub.is_published = False
        self.pub.save()
        self.assertEqual(self.client.get(self.pub.get_absolute_url()).status_code, 404)

    def test_metrics_shown_only_when_present(self):
        self.pub.citations = 12
        self.pub.save()
        html = self.client.get(self.pub.get_absolute_url()).content.decode()
        self.assertIn("Explore all metrics", html)
        self.assertIn("<strong>12</strong> Citations", html)

    def test_publications_list_links_to_article(self):
        self.assertIn(self.pub.get_absolute_url(), self.client.get("/en/publications/").content.decode())

    def test_body_markup_is_escaped(self):
        from .article import render_body

        sec = m.ArticleSection.objects.create(publication=self.pub, kind="other", body="Hi <script>alert(1)</script> see [3]\n\n- a\n- b\n\n### Sub")
        html = render_body(sec.body, self.pub, {})
        self.assertNotIn("<script>", html)
        self.assertIn('href="#ref-3"', html)
        self.assertIn("<ul><li>a</li><li>b</li></ul>", html)
        self.assertIn("<h3>Sub</h3>", html)


class PdfImportTests(TestCase):
    PDF = __import__("pathlib").Path(__file__).parent / "fixtures" / "mpox_article" / "paper.pdf"

    @classmethod
    def setUpTestData(cls):
        from .pdf_extract import extract

        cls.res = extract(cls.PDF.read_bytes())

    def test_extracts_metadata_abstract_and_structure(self):
        d = self.res.data
        self.assertEqual(d["title"], "Ethical considerations during Mpox Outbreak: a scoping review")
        self.assertEqual((d["doi"], d["journal"], d["year"], d["volume"], d["article_number"]),
                         ("10.1186/s12910-024-01078-0", "BMC Medical Ethics", 2024, "25", "79"))
        self.assertEqual((d["license"], d["received_date"], d["accepted_date"]), ("CC BY 4.0", "2023-08-16", "2024-07-03"))
        for part in ("abstract_background", "abstract_methods", "abstract_results", "abstract_conclusion"):
            self.assertTrue(d[part], part)
        self.assertTrue(d["keywords"].startswith("Monkeypox, Stigma"))
        kinds = [s["kind"] for s in d["sections"]]
        for k in ("introduction", "methodology", "results", "discussion", "conclusion", "data_availability", "ethics"):
            self.assertIn(k, kinds)
        self.assertEqual(self.res.warnings, [])

    def test_matches_reviewed_fixture(self):
        import json
        import re
        from difflib import SequenceMatcher

        ref = json.loads((self.PDF.parent / "article.json").read_text(encoding="utf-8"))
        d = self.res.data
        self.assertEqual([r["number"] for r in d["references"]], list(range(1, 90)))
        same = sum(a["text"].replace(" ", "") == b["text"].replace(" ", "") for a, b in zip(d["references"], ref["references"]))
        self.assertGreaterEqual(same, 85)
        self.assertEqual([a["name"] for a in d["authors_detail"]], [a["name"] for a in ref["authors_detail"]])
        self.assertTrue(all(a["affiliation"] for a in d["authors_detail"]))
        norm = lambda sections: re.sub(r"\s+", " ", re.sub(r"\[\[.*?\]\]|### ", "", " ".join(s["body"] for s in sections if s["kind"] in ("introduction", "methodology", "results", "discussion"))))
        self.assertGreater(SequenceMatcher(None, norm(d["sections"])[:12000], norm(ref["sections"])[:12000]).ratio(), 0.98)

    def test_figures_table_and_markers(self):
        d = self.res.data
        self.assertEqual(sorted((f["kind"], f["number"]) for f in d["figures"]), [("figure", 1), ("figure", 2), ("table", 1)])
        self.assertEqual(len(self.res.images), 2)
        table = next(f for f in d["figures"] if f["kind"] == "table")
        self.assertEqual(table["table_html"].count("<tr>"), 7)
        self.assertIn("USA: United States of America", table["note"])
        body = " ".join(s["body"] for s in d["sections"])
        for marker in ("[[fig:1]]", "[[fig:2]]", "[[table:1]]"):
            self.assertIn(marker, body)

    def test_generalises_to_another_single_column_layout(self):
        from .pdf_extract import extract

        d = extract((self.PDF.parent.parent / "test_onecolumn.pdf").read_bytes()).data
        self.assertEqual(d["title"], "Machine learning for early cardiovascular risk prediction in primary care")
        self.assertEqual(d["authors"], "Sara Ahmed, John Smith, Layla Hassan")
        self.assertEqual(d["doi"], "")  # a DOI that only appears in the reference list must not be taken as the article's
        self.assertEqual([s["kind"] for s in d["sections"]], ["introduction", "methods", "results", "discussion", "conclusion"])
        self.assertEqual(d["abstract_results"], "AUC reached 0.87.")
        self.assertEqual([r["number"] for r in d["references"]], [1, 2, 3])
        self.assertEqual(d["keywords"], "cardiology, machine learning, risk prediction")

    def test_unheaded_abstract_caps_headings_and_credentials(self):
        """Journal layout with a label-only abstract box, UPPERCASE section headings and 'Name, M.D.' authors."""
        from reportlab.pdfgen import canvas

        from .pdf_extract import extract

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(595, 783))
        c.setFont("Helvetica-Bold", 19); c.drawString(44, 700, "Sleep and mood in young adults: a review")
        c.setFont("Helvetica", 9); c.drawString(44, 670, "Sara Ahmed, M.Sc., John Smith, M.D., Layla Hassan, Ph.D.")
        c.setFont("Helvetica", 8.5)
        y = 620
        for t in ("Background: Sleep affects mood in many people across the world today.", "Aim: To review the evidence on sleep and mood.",
                  "Methods: We searched three databases for relevant studies on this.", "Results: Poor sleep was linked with low mood in all studies.",
                  "Conclusion: Sleep matters for mental health and needs more study."):
            c.drawString(59, y, t); y -= 14
        c.setFont("Helvetica", 7.5); c.drawString(300, 480, "Psych Res Clin Pract. 2024; 6:124-133; doi: 10.1176/appi.")
        c.drawString(300, 470, "prcp.20230076")
        c.setFont("Helvetica", 9.5)
        y = 400
        for i in range(8):
            c.drawString(44, y, "Sleep is a basic need and many adults sleep too little each night of the week."); y -= 12
        c.showPage()
        c.setFont("Helvetica", 9.5)
        c.drawString(44, 700, "METHODS"); y = 685
        for i in range(10):
            c.drawString(44, y, "We included randomised trials and cohort studies that measured sleep and mood."); y -= 12
        c.drawString(44, y - 10, "RESULTS"); y -= 25
        for i in range(10):
            c.drawString(44, y, "Twelve studies were included and most reported a link between sleep and mood."); y -= 12
        c.showPage()
        c.setFont("Helvetica", 8); c.drawString(44, 700, "REFERENCES")
        c.drawString(44, 685, "1. Doe J, Roe R. Sleep and mood. Sleep J. 2020;5(1):1-9. https://doi.org/10.1000/")
        c.drawString(58, 675, "abcd.1234")
        c.drawString(44, 660, "2. Poe P. Rest and mind. Mind J. 2019;3:4-8.")
        c.showPage(); c.save()
        r = extract(buf.getvalue())
        d = r.data
        self.assertEqual(d["authors"], "Sara Ahmed, John Smith, Layla Hassan")
        self.assertEqual(d["doi"], "10.1176/appi.prcp.20230076")
        self.assertEqual(d["journal"], "Psych Res Clin Pract")
        self.assertIn("review the evidence", d["abstract_background"])
        self.assertTrue(d["abstract_methods"].startswith("We searched") and d["abstract_conclusion"].startswith("Sleep matters"))
        self.assertEqual([s["kind"] for s in d["sections"]], ["introduction", "methods", "results"])
        self.assertEqual(d["sections"][1]["heading"], "Methods")
        self.assertEqual([x["number"] for x in d["references"]], [1, 2])
        self.assertEqual(d["references"][0]["doi"], "10.1000/abcd.1234")

    def test_scanned_pdf_is_reported(self):
        from .pdf_extract import extract

        blank = io.BytesIO()
        Image.new("RGB", (600, 800), "white").save(blank, "PDF")
        self.assertIn("no_text", extract(blank.getvalue()).warnings)

    def test_crossref_merge(self):
        from . import crossref

        data = {"title": "T", "authors_detail": [{"name": "Jane Doe", "affiliation": "", "corresponding": True, "email": "j@x.org"}],
                "references": [{"number": 1, "text": "Doe J. Great paper. Nature. 2020", "doi": "", "title": "", "authors": "", "source": ""},
                               {"number": 2, "text": "Roe R. Other. Lancet. 2019", "doi": "", "title": "", "authors": "", "source": ""}]}
        cr = {"container-title": ["Nature"], "volume": "5", "publisher": "NPG", "ISSN": ["1234-5678"], "is-referenced-by-count": 7,
              "issued": {"date-parts": [[2021, 3, 4]]}, "license": [{"URL": "https://creativecommons.org/licenses/by/4.0/"}],
              "author": [{"given": "Jane", "family": "Doe", "ORCID": "http://orcid.org/0000-0002-1825-0097", "affiliation": [{"name": "Uni X"}]}],
              "reference": [{"DOI": "10.1/aaa", "article-title": "Great paper"}, {"DOI": "10.1/bbb", "article-title": "Other"}]}
        notes = crossref.apply(data, cr)
        self.assertEqual((data["journal"], data["volume"], data["year"], data["published_date"], data["citations"]), ("Nature", "5", 2021, "2021-03-04", 7))
        self.assertEqual((data["license"], data["open_access"]), ("CC BY 4.0", True))
        a = data["authors_detail"][0]
        self.assertEqual((a["orcid"], a["affiliation"], a["corresponding"], a["email"]), ("0000-0002-1825-0097", "Uni X", True, "j@x.org"))
        self.assertEqual([r["doi"] for r in data["references"]], ["10.1/aaa", "10.1/bbb"])
        self.assertIn("authors", notes)

    def _pdf(self):
        return SimpleUploadedFile("p.pdf", self.PDF.read_bytes(), content_type="application/pdf")

    @override_settings(MEDIA_ROOT=_tempfile.mkdtemp())
    def test_one_click_publish_undo_and_conflict_flow(self):
        u = get_user_model().objects.create_superuser("root", "r@x.com", "pw")
        self.client.force_login(u)
        url = reverse("admin:core_publication_import_article")
        page = self.client.get(url)
        self.assertContains(page, "Publish now")
        self.assertContains(page, "Save as draft first")
        # one click: upload + "Publish now" -> live, result page
        with mock.patch("core.crossref.fetch", return_value=None):
            r = self.client.post(url, {"pdf": self._pdf(), "action": "publish"})
        pub = m.Publication.objects.get(doi="10.1186/s12910-024-01078-0")
        self.assertRedirects(r, reverse("admin:core_publication_import_done", args=[pub.pk]))
        self.assertTrue(pub.is_published)
        self.assertEqual((pub.references.count(), pub.author_list.count(), pub.figures.count()), (89, 10, 3))
        done = self.client.get(reverse("admin:core_publication_import_done", args=[pub.pk]))
        self.assertContains(done, "Your paper is live")
        self.assertContains(done, "Undo (hide it)")
        self.client.logout()
        self.assertEqual(self.client.get(pub.get_absolute_url()).status_code, 200)
        # undo with one click
        self.client.force_login(u)
        self.client.post(reverse("admin:core_publication_import_done", args=[pub.pk]), {"do": "unpublish"})
        pub.refresh_from_db()
        self.assertFalse(pub.is_published)
        self.assertEqual(self.client.get(pub.get_absolute_url()).status_code, 200)  # staff preview still works
        self.client.logout()
        self.assertEqual(self.client.get(pub.get_absolute_url()).status_code, 404)
        # same DOI again -> asks before replacing, no duplicate created
        self.client.force_login(u)
        with mock.patch("core.crossref.fetch", return_value=None):
            r = self.client.post(url, {"pdf": self._pdf(), "action": "publish"})
        self.assertContains(r, "already on the site")
        token = r.context["token"]
        self.assertEqual(m.Publication.objects.filter(doi=pub.doi).count(), 1)
        with mock.patch("core.crossref.fetch", return_value=None):
            self.client.post(url, {"token": token, "action": "publish"})
        pub.refresh_from_db()
        self.assertTrue(pub.is_published)
        self.assertEqual(m.Publication.objects.filter(doi=pub.doi).count(), 1)

    @override_settings(MEDIA_ROOT=_tempfile.mkdtemp())
    def test_save_as_draft_keeps_it_private_and_cancel_works(self):
        u = get_user_model().objects.create_superuser("root", "r@x.com", "pw")
        self.client.force_login(u)
        url = reverse("admin:core_publication_import_article")
        with mock.patch("core.crossref.fetch", return_value=None):
            self.client.post(url, {"pdf": self._pdf(), "action": "draft"})
        pub = m.Publication.objects.get()
        self.assertFalse(pub.is_published)
        self.client.logout()
        self.assertEqual(self.client.get(pub.get_absolute_url()).status_code, 404)
        self.client.force_login(u)
        self.client.post(reverse("admin:core_publication_import_done", args=[pub.pk]), {"do": "publish"})
        pub.refresh_from_db()
        self.assertTrue(pub.is_published)
        with mock.patch("core.crossref.fetch", return_value=None):
            r = self.client.post(url, {"pdf": self._pdf(), "action": "draft"})
        token = r.context["token"]
        r = self.client.post(url, {"token": token, "cancel": "1"})
        self.assertEqual(r.status_code, 302)
        self.assertEqual(m.Publication.objects.count(), 1)

    def test_add_by_doi_uses_crossref_and_reports_failures(self):
        u = get_user_model().objects.create_superuser("root", "r@x.com", "pw")
        self.client.force_login(u)
        cr = {"title": ["A paper about X"], "container-title": ["Nature"], "volume": "5", "issued": {"date-parts": [[2022]]},
              "author": [{"given": "Jane", "family": "Doe"}]}
        with mock.patch("core.crossref.fetch", side_effect=lambda d: cr if d == "10.1000/ok" else None):
            self.client.post(reverse("admin:core_publication_add_by_doi"), {"dois": "10.1000/ok\n10.1000/bad"})
        pub = m.Publication.objects.get(doi="10.1000/ok")
        self.assertEqual((pub.title, pub.journal, pub.year, pub.authors), ("A paper about X", "Nature", 2022, "Jane Doe"))
        self.assertEqual(m.Publication.objects.count(), 1)
        self.assertFalse(pub.has_article)

    def test_dashboard_has_big_task_buttons_and_simple_forms(self):
        u = get_user_model().objects.create_superuser("root", "r@x.com", "pw")
        self.client.force_login(u)
        home = self.client.get("/admin/")
        self.assertContains(home, "What do you want to do?")
        self.assertContains(home, "Add a research paper")
        self.assertContains(home, reverse("admin:core_publication_import_article"))
        for model in ("post", "project", "teammember", "trainingprogram", "opportunity", "hubitem", "publication"):
            form = self.client.get(f"/admin/core/{model}/add/")
            self.assertEqual(form.status_code, 200, model)
        self.assertContains(self.client.get("/admin/core/post/add/"), "More options (optional)")
        post = m.Post.objects.create(title_en="T", body_en="b")
        self.assertEqual(post.published_at, timezone.localdate())  # default date: no need to type it

    def test_admin_import_rejects_non_pdf(self):
        u = get_user_model().objects.create_superuser("root", "r@x.com", "pw")
        self.client.force_login(u)
        r = self.client.post(reverse("admin:core_publication_import_article"), {"pdf": SimpleUploadedFile("x.pdf", b"not a pdf")})
        self.assertContains(r, "not a valid PDF")
        self.assertEqual(m.Publication.objects.count(), 0)


class PdfProblemMessagesTests(TestCase):
    PDF = __import__("pathlib").Path(__file__).parent / "fixtures" / "mpox_article" / "paper.pdf"

    def setUp(self):
        self.u = get_user_model().objects.create_superuser("root", "r@x.com", "pw")
        self.client.force_login(self.u)
        self.url = reverse("admin:core_publication_import_article")

    def post(self, data=None):
        return self.client.post(self.url, {"pdf": SimpleUploadedFile("p.pdf", data or self.PDF.read_bytes(), content_type="application/pdf"), "action": "publish"})

    def test_missing_library_gives_actionable_message(self):
        with mock.patch("core.pdf_extract.extract", side_effect=ImportError("No module named 'pdfminer'", name="pdfminer")):
            r = self.post()
        self.assertContains(r, "pip install -r requirements.txt")
        self.assertEqual(m.Publication.objects.count(), 0)

    def test_unexpected_error_shows_reason_and_command(self):
        with mock.patch("core.pdf_extract.extract", side_effect=ValueError("boom")):
            r = self.post()
        self.assertContains(r, "ValueError: boom")
        self.assertContains(r, "check_pdf")

    def test_encrypted_pdf_is_explained(self):
        from pypdf import PdfReader, PdfWriter

        w = PdfWriter()
        for page in PdfReader(str(self.PDF)).pages[:2]:
            w.add_page(page)
        try:
            w.encrypt("secret")
        except Exception:
            self.skipTest("encryption backend not available")
        buf = io.BytesIO()
        w.write(buf)
        self.assertContains(self.post(buf.getvalue()), "password-protected")

    def test_check_pdf_command_reports_a_good_file(self):
        from django.core.management import call_command

        out = io.StringIO()
        call_command("check_pdf", str(self.PDF), stdout=out)
        text = out.getvalue()
        self.assertIn("Extraction worked", text)
        self.assertIn("references: 89", text)


# ---- Student portal ---------------------------------------------------------------------------
@override_settings(FORM_PROTECTION=False, PRIVATE_MEDIA_ROOT=_tempfile.mkdtemp())
class PortalTests(Base):
    PW = "S3cure-pass-77"

    def signup(self, email="sara@example.com", name="Sara Ahmed"):
        return self.client.post("/en/account/signup/", {"full_name": name, "email": email, "university": "Cairo U", "password1": self.PW, "password2": self.PW})

    def verified_client(self, email="sara@example.com"):
        self.signup(email)
        user = get_user_model().objects.get(username=email)
        self.client.get(reverse("portal_verify", args=[__import__("core.portal", fromlist=["x"]).verify_token(user)]))
        return user

    def program(self, **kw):
        return m.TrainingProgram.objects.create(title="Meta-analysis 101", slug="meta-101", kind="course", **kw)

    def test_signup_requires_email_confirmation(self):
        r = self.signup()
        self.assertRedirects(r, "/en/account/confirm-email/")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/account/confirm-email/", mail.outbox[0].body)
        # unverified students cannot use the dashboard
        self.assertRedirects(self.client.get("/en/account/"), "/en/account/confirm-email/")
        user = get_user_model().objects.get(username="sara@example.com")
        self.assertFalse(user.is_staff)
        self.client.get(reverse("portal_verify", args=[__import__("core.portal", fromlist=["x"]).verify_token(user)]))
        self.assertEqual(self.client.get("/en/account/").status_code, 200)
        self.assertTrue(m.StudentProfile.objects.get(user=user).email_verified)

    def test_bad_verification_link_and_duplicate_email(self):
        self.assertEqual(self.client.get("/en/account/confirm-email/garbage/").status_code, 400)
        self.signup()
        self.client.logout()
        r = self.signup()
        self.assertContains(r, "already exists")

    def test_weak_or_mismatched_password_rejected(self):
        r = self.client.post("/en/account/signup/", {"full_name": "A B", "email": "a@x.org", "password1": "12345678", "password2": "12345678"})
        self.assertEqual(r.status_code, 200)
        self.assertFalse(get_user_model().objects.filter(username="a@x.org").exists())

    def test_login_logout_and_anonymous_redirect(self):
        self.assertEqual(self.client.get("/en/account/courses/").status_code, 302)
        self.verified_client()
        self.client.post("/en/account/logout/")
        r = self.client.post("/en/account/login/", {"username": "SARA@example.com", "password": self.PW})
        self.assertRedirects(r, "/en/account/", fetch_redirect_response=False)
        self.client.post("/en/account/logout/")
        r = self.client.post("/en/account/login/", {"username": "sara@example.com", "password": "wrong"})
        self.assertContains(r, "Incorrect email or password")

    def test_staff_cannot_use_student_accounts_to_enter_admin(self):
        self.verified_client()
        self.assertEqual(self.client.get("/admin/", follow=False).status_code, 302)

    def test_enroll_approve_notify_and_materials_gate(self):
        from django.core.files.base import ContentFile

        user = self.verified_client()
        prog = self.program(capacity=1)
        mat = m.CourseMaterial.objects.create(program=prog, title="Slides")
        mat.file.save("slides.pdf", ContentFile(b"%PDF-1.4 slides"))
        self.client.post(reverse("portal_enroll", args=["meta-101"]))
        enr = m.Enrollment.objects.get(student=user)
        self.assertEqual(enr.status, "pending")
        self.assertEqual(enr.registration.status, "pending")
        page = self.client.get("/en/account/courses/meta-101/")
        self.assertNotContains(page, "slides")          # no materials before approval
        self.assertEqual(self.client.get(reverse("portal_file", args=[mat.file.name])).status_code, 404)
        mail.outbox.clear()
        enr.status, enr.note = "approved", "Welcome aboard"
        enr.save()
        enr.registration.refresh_from_db()
        self.assertEqual(enr.registration.status, "confirmed")
        self.assertEqual(m.Notification.objects.filter(user=user).count(), 3)  # welcome, received, approved
        self.assertIn("Welcome aboard", mail.outbox[0].body)
        self.assertContains(self.client.get("/en/account/courses/meta-101/"), "Slides")
        dl = self.client.get(reverse("portal_file", args=[mat.file.name]))
        self.assertEqual(dl.status_code, 200)
        self.assertEqual(b"".join(dl.streaming_content), b"%PDF-1.4 slides")

    def test_other_students_and_anonymous_cannot_download(self):
        from django.core.files.base import ContentFile

        owner = self.verified_client("a@example.com")
        req = m.ProjectRequest.objects.create(student=owner, title="P", summary="S")
        req.attachment.save("plan.pdf", ContentFile(b"secret"))
        self.assertEqual(self.client.get(reverse("portal_file", args=[req.attachment.name])).status_code, 200)
        self.client.post("/en/account/logout/")
        self.assertEqual(self.client.get(reverse("portal_file", args=[req.attachment.name])).status_code, 302)
        self.verified_client("b@example.com")
        self.assertEqual(self.client.get(reverse("portal_file", args=[req.attachment.name])).status_code, 404)
        self.assertEqual(self.client.get(reverse("portal_project", args=[req.pk])).status_code, 404)

    def test_full_program_goes_to_waiting_list(self):
        prog = self.program(capacity=1)
        m.TrainingRegistration.objects.create(program=prog, name="X", email="x@x.org", status="confirmed")
        user = self.verified_client()
        self.client.post(reverse("portal_enroll", args=["meta-101"]))
        self.assertEqual(m.Enrollment.objects.get(student=user).status, "waitlist")

    def test_enroll_reuses_existing_registration_and_is_idempotent(self):
        prog = self.program()
        self.verified_client()
        m.TrainingRegistration.objects.create(program=prog, name="Sara", email="sara@example.com")
        self.client.post(reverse("portal_enroll", args=["meta-101"]))
        self.client.post(reverse("portal_enroll", args=["meta-101"]))
        self.assertEqual(m.TrainingRegistration.objects.count(), 1)
        self.assertEqual(m.Enrollment.objects.count(), 1)

    def test_registration_admin_status_moves_enrollment(self):
        from .admin import RegistrationAdmin

        user = self.verified_client()
        self.program()
        self.client.post(reverse("portal_enroll", args=["meta-101"]))
        reg = m.TrainingRegistration.objects.get()
        reg.status = "confirmed"
        reg.save()
        RegistrationAdmin._sync_enrollment(reg)
        self.assertEqual(m.Enrollment.objects.get(student=user).status, "approved")

    def test_project_request_lifecycle(self):
        user = self.verified_client()
        r = self.client.post("/en/account/projects/new/", {"title": "Sleep study", "summary": "Does sleep affect mood?"})
        req = m.ProjectRequest.objects.get()
        self.assertRedirects(r, f"/en/account/projects/{req.pk}/")
        self.assertEqual(req.status, "draft")
        self.client.post(f"/en/account/projects/{req.pk}/", {"title": "Sleep study", "summary": "Does sleep affect mood in students?", "submit": "1"})
        req.refresh_from_db()
        self.assertEqual(req.status, "submitted")
        self.assertIsNotNone(req.submitted_at)
        # no longer editable once submitted
        self.client.post(f"/en/account/projects/{req.pk}/", {"title": "Hacked", "summary": "x"})
        req.refresh_from_db()
        self.assertEqual(req.title, "Sleep study")
        mail.outbox.clear()
        req.status, req.review_note = "rejected", "Please narrow the scope"
        req.save()
        self.assertIn("Please narrow the scope", mail.outbox[-1].body)
        self.assertTrue(req.editable)  # a rejected request can be fixed and resubmitted
        self.client.post(f"/en/account/projects/{req.pk}/", {"title": "Sleep study v2", "summary": "Narrower", "submit": "1"})
        req.refresh_from_db()
        self.assertEqual((req.status, req.title), ("submitted", "Sleep study v2"))
        self.assertTrue(user.notifications.filter(text__icontains="Rejected").exists())

    def test_upload_validation(self):
        self.verified_client()
        bad = SimpleUploadedFile("evil.exe", b"MZ", content_type="application/octet-stream")
        r = self.client.post("/en/account/projects/new/", {"title": "T", "summary": "S", "attachment": bad})
        self.assertContains(r, "Unsupported file type")
        self.assertEqual(m.ProjectRequest.objects.count(), 0)
        ok = SimpleUploadedFile("plan.pdf", b"%PDF-1.4", content_type="application/pdf")
        self.client.post("/en/account/projects/new/", {"title": "T", "summary": "S", "attachment": ok})
        self.assertTrue(m.ProjectRequest.objects.get().attachment.name.startswith("requests/"))

    def test_drafts_only_can_be_deleted_and_notifications_marked_read(self):
        user = self.verified_client()
        req = m.ProjectRequest.objects.create(student=user, title="T", summary="S", status="submitted")
        self.client.post(f"/en/account/projects/{req.pk}/delete/")
        self.assertTrue(m.ProjectRequest.objects.filter(pk=req.pk).exists())
        self.assertGreater(user.notifications.filter(read=False).count(), 0)
        self.client.get("/en/account/notifications/")
        self.assertEqual(user.notifications.filter(read=False).count(), 0)

    def test_password_reset_email(self):
        self.verified_client()
        self.client.post("/en/account/logout/")
        mail.outbox.clear()
        self.client.post("/en/account/password-reset/", {"email": "sara@example.com"})
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/account/reset/", mail.outbox[0].body)

    def test_arabic_portal_renders_rtl(self):
        self.verified_client()
        r = self.client.get("/ar/account/")
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, 'dir="rtl"')
        self.assertContains(r, "لوحة")

    def test_profile_update_and_arabic_language_for_notifications(self):
        user = self.verified_client()
        self.client.post("/en/account/profile/", {"p-full_name": "Sara M. Ahmed", "p-university": "AUC", "p-field_of_study": "Medicine", "p-phone": "", "p-language": "ar"})
        user.refresh_from_db()
        self.assertEqual(user.get_full_name(), "Sara M. Ahmed")
        self.assertEqual(user.student.language, "ar")
        prog = self.program()
        self.client.post(reverse("portal_enroll", args=["meta-101"]))
        enr = m.Enrollment.objects.get()
        mail.outbox.clear()
        enr.status = "approved"
        enr.save()
        self.assertIn("SiaNexis", mail.outbox[0].subject)
        self.assertTrue(any("؀" <= ch <= "ۿ" for ch in mail.outbox[0].subject))  # Arabic subject

    def test_admin_pages_and_actions(self):
        from django.contrib.auth import get_user_model as gum

        user = self.verified_client()
        self.program()
        self.client.post(reverse("portal_enroll", args=["meta-101"]))
        req = m.ProjectRequest.objects.create(student=user, title="P", summary="S", status="submitted")
        self.client.post("/en/account/logout/")
        staff = gum().objects.create_superuser("boss", "boss@example.com", "pw-Boss-12345")
        self.client.force_login(staff)
        for name in ("studentprofile", "enrollment", "projectrequest", "trainingprogram"):
            self.assertEqual(self.client.get(reverse(f"admin:core_{name}_changelist")).status_code, 200, name)
        enr = m.Enrollment.objects.get()
        self.client.post(reverse("admin:core_enrollment_changelist"), {"action": "approve", "_selected_action": [enr.pk]})
        enr.refresh_from_db()
        self.assertEqual(enr.status, "approved")
        self.client.post(reverse("admin:core_projectrequest_changelist"), {"action": "approve", "_selected_action": [req.pk]})
        self.client.post(reverse("admin:core_projectrequest_changelist"), {"action": "make_public_draft", "_selected_action": [req.pk]})
        req.refresh_from_db()
        self.assertEqual(req.status, "approved")
        self.assertFalse(req.project.is_published)
        self.assertEqual(self.client.get("/admin/").status_code, 200)

    def test_header_links(self):
        home = self.client.get("/en/")
        self.assertContains(home, "/en/account/login/")
        self.assertContains(home, "/en/account/signup/")
        self.verified_client()
        self.assertContains(self.client.get("/en/"), "/en/account/")

    def test_staff_sees_signup_button_and_admin_link_in_footer_only(self):
        staff = get_user_model().objects.create_superuser("boss", "boss@example.com", "pw-Boss-12345")
        self.client.force_login(staff)
        home = self.client.get("/en/")
        self.assertContains(home, "/en/account/signup/")
        self.assertContains(home, 'href="/admin/"')
        self.assertEqual(self.client.get("/en/account/signup/").status_code, 200)


@override_settings(FORM_PROTECTION=False, FIREBASE_PROJECT_ID="demo-proj", FIREBASE_WEB_API_KEY="web-key", FIREBASE_ASYNC=False)
class FirebaseTests(Base):
    CLAIMS = {"iss": "https://securetoken.google.com/demo-proj", "aud": "demo-proj", "sub": "uid1", "email": "Gina@Example.com",
              "email_verified": True, "name": "Gina Lee"}

    def post(self, claims=None, token="tok", **extra):
        from . import firebase

        with mock.patch.object(firebase, "verify_id_token", return_value=claims or self.CLAIMS) as v:
            r = self.client.post(reverse("portal_firebase_login"), data=json.dumps({"idToken": token, **extra}), content_type="application/json")
        return r

    def test_google_button_only_when_configured(self):
        self.assertContains(self.client.get("/en/account/login/"), "google-signin")
        with override_settings(FIREBASE_WEB_API_KEY=""):
            self.assertNotContains(self.client.get("/en/account/login/"), "google-signin")
            self.assertEqual(self.client.post(reverse("portal_firebase_login"), data="{}", content_type="application/json").status_code, 404)

    def test_google_login_creates_verified_student(self):
        r = self.post()
        self.assertEqual(r.json(), {"ok": True, "redirect": "/en/account/"})
        u = get_user_model().objects.get(username="gina@example.com")
        self.assertEqual((u.first_name, u.last_name), ("Gina", "Lee"))
        self.assertFalse(u.has_usable_password())
        self.assertTrue(u.student.email_verified)
        self.assertEqual(self.client.get("/en/account/").status_code, 200)

    def test_google_login_links_existing_student_and_honours_safe_next(self):
        existing = get_user_model().objects.create_user("gina@example.com", "gina@example.com", "pw-12345-Abc")
        r = self.post(next="/en/training/")
        self.assertEqual(r.json()["redirect"], "/en/training/")
        self.assertEqual(get_user_model().objects.filter(email="gina@example.com").count(), 1)
        self.assertTrue(m.StudentProfile.objects.get(user=existing).email_verified)
        self.client.logout()
        self.assertEqual(self.post(next="https://evil.example/")["Content-Type"], "application/json")
        self.assertEqual(self.post(next="https://evil.example/").json()["redirect"], "/en/account/")

    def test_staff_and_unverified_or_bad_tokens_are_refused(self):
        get_user_model().objects.create_superuser("gina@example.com", "gina@example.com", "pw-12345-Abc")
        self.assertEqual(self.post().status_code, 403)
        self.assertEqual(self.client.get("/admin/").status_code, 302)  # still not logged in
        self.assertEqual(self.post({**self.CLAIMS, "email": "x@example.com", "email_verified": False}).status_code, 400)
        from . import firebase

        with mock.patch.object(firebase, "verify_id_token", side_effect=ValueError("bad")):
            r = self.client.post(reverse("portal_firebase_login"), data=json.dumps({"idToken": "x"}), content_type="application/json")
        self.assertEqual(r.status_code, 400)

    def test_token_verification_checks_issuer(self):
        from . import firebase

        with mock.patch("google.oauth2.id_token.verify_firebase_token", return_value={**self.CLAIMS, "iss": "https://securetoken.google.com/other"}):
            with self.assertRaises(ValueError):
                firebase.verify_id_token("t")
        with mock.patch("google.oauth2.id_token.verify_firebase_token", return_value=self.CLAIMS):
            self.assertEqual(firebase.verify_id_token("t")["sub"], "uid1")

    @override_settings(FIREBASE_FIRESTORE_MIRROR=True)
    def test_firestore_mirror_upserts_and_deletes(self):
        from . import firebase

        calls = []
        sess = mock.Mock()
        sess.patch.side_effect = lambda url, json=None, timeout=None: calls.append(("PATCH", url, json)) or mock.Mock(raise_for_status=lambda: None)
        sess.delete.side_effect = lambda url, timeout=None: calls.append(("DELETE", url)) or mock.Mock(status_code=200, raise_for_status=lambda: None)
        with mock.patch.object(firebase, "_get_session", return_value=sess):
            u = get_user_model().objects.create_user("s@example.com", "s@example.com", "pw-12345-Abc", first_name="S", last_name="T")
            prof = m.StudentProfile.objects.create(user=u, university="AUC")
            prog = m.TrainingProgram.objects.create(title="Course", slug="course", kind="course")
            enr = m.Enrollment.objects.create(student=u, program=prog)
            req = m.ProjectRequest.objects.create(student=u, title="Secret idea", summary="private proposal text")
            enr_pk = enr.pk
            enr.delete()
        patched = {c[1].split("/documents/")[1]: c[2]["fields"] for c in calls if c[0] == "PATCH"}
        self.assertEqual(patched[f"students/{u.pk}"]["university"], {"stringValue": "AUC"})
        self.assertEqual(patched[f"enrollments/{enr_pk}"]["status"], {"stringValue": "pending"})
        self.assertIn(f"projectRequests/{req.pk}", patched)
        self.assertNotIn("private proposal text", json.dumps(patched))  # proposal texts are never mirrored
        self.assertTrue(any(c[0] == "DELETE" and c[1].endswith("/enrollments/" + str(enr_pk)) for c in calls))

    def test_mirror_failure_never_breaks_saving(self):
        from . import firebase

        with override_settings(FIREBASE_FIRESTORE_MIRROR=True), mock.patch.object(firebase, "_get_session", side_effect=RuntimeError("no creds")), self.assertLogs("core.firebase", "ERROR"):
            u = get_user_model().objects.create_user("t@example.com", "t@example.com", "pw-12345-Abc")
            m.StudentProfile.objects.create(user=u)
        self.assertTrue(m.StudentProfile.objects.filter(user=u).exists())

    def test_hosting_config_files(self):
        from pathlib import Path

        root = Path(__file__).resolve().parent.parent
        cfg = json.loads((root / "firebase.json").read_text())
        self.assertEqual(cfg["hosting"]["rewrites"][0]["run"]["serviceId"], "sianexis")
        self.assertIn("allow read, write: if false", (root / "firestore.rules").read_text())
