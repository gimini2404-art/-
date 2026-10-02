# SiaNexis REST API (read-only)

Base URL: `/api/v1/` - JSON, no authentication, only published content. Add `?lang=ar` for Arabic (default `en`).
Paginated (`page`, 20 per page). Rate limit: `API_THROTTLE` (default 120/min per IP).

| Endpoint | Filters |
|---|---|
| `/research-areas/` | |
| `/services/` (categories with their services) | |
| `/projects/` | `area=<slug>`, `status=` |
| `/publications/` | `year=`, `kind=`, `project=<slug>` |
| `/hub/` | `category=`, `status=`, `area=<slug>` |
| `/news/` | |
| `/training/` | `kind=` |
| `/opportunities/` | `kind=` |
| `/collaborations/` (with `latitude`/`longitude`) | `type=`, `country=` |
| `/team/` | `group=team\|advisory` |
| `/metrics/` | |

Example: `GET /api/v1/projects/?area=oncology&lang=ar`

## CRM webhook payload (outgoing)
When `CRM_WEBHOOK_URL` is set, every contact request, training registration and newsletter sign-up is POSTed as
`{"event": "contact_request|training_registration|newsletter_subscriber", "sent_at": <unix>, "data": {...}}`.
If `CRM_WEBHOOK_SECRET` is set, the header `X-SiaNexis-Signature` carries the HMAC-SHA256 (hex) of the raw body.
With `HUBSPOT_TOKEN` a HubSpot contact is created directly. The outcome is shown per request in the CMS (CRM sync).
