# Student portal

Students create an account at `/en/account/signup/` (or `/ar/account/signup/`), confirm their email, and get a dashboard:

| Page | URL | What it does |
|---|---|---|
| Dashboard | `/account/` | counts, latest courses/projects, notifications |
| My courses | `/account/courses/` | enrollment status, course materials (after approval) |
| My projects | `/account/projects/` | request a project, save drafts, submit, edit if rejected |
| Profile | `/account/profile/` | name, university, language, change password |
| Notifications | `/account/notifications/` | in-site list; each one is also emailed in the student's language |

Students enroll from any training page ("Enroll with my student account"). The anonymous registration form still works.

## Team workflow (admin → **Students** section)
* **Course enrollments** – approve / reject / complete (bulk actions or the Status column). The student is notified by email + in the dashboard. Enrollment is kept in step with the existing *Training registration* list (confirming a registration approves the linked enrollment).
* **Student project requests** – *Start review*, *Approve*, *Reject* (write a message in "Message to the student"), or *Create a draft public project* (private by default; publish it yourself under Projects).
* **Course materials** – add files/links inside each *Training program*; only approved students can download them.
* **Students** – list of accounts (read-only; students manage their own profile).

## Security notes
* Email confirmation is required before the dashboard opens (link valid 3 days). Without `EMAIL_HOST` emails print to the console (development).
* Student accounts are never staff: they cannot enter `/admin/`.
* Uploads (project attachments, course materials) live in `PRIVATE_MEDIA_ROOT` (default `./private`, git-ignored, **not** served publicly) and are streamed by `/portal-files/…` only to the owner, staff, or approved students.
* Signup/login are rate limited and use the same honeypot/fill-time/CAPTCHA protection as the other forms.
* In production back up `PRIVATE_MEDIA_ROOT` together with `MEDIA_ROOT` and the database.
