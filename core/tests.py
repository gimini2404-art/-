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
