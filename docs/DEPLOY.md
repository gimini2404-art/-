# Deploying SiaNexis

Requirements: a Linux server with Docker + Docker Compose, a domain whose DNS A record points at the server, ports 80/443 open.

```bash
git clone <repo> sianexis && cd sianexis
cp .env.example .env        # fill DOMAIN, DJANGO_SECRET_KEY, DB_PASSWORD, admin account, SMTP
docker compose up -d --build
```
Caddy obtains and renews the HTTPS certificate automatically. After the first start set `RUN_SEED=0` in `.env`.

* **Backups:** the `backup` service writes `db-YYYY-MM-DD.sql.gz` and `media-YYYY-MM-DD.tar.gz` to `./backups/` daily
  (03:00 UTC, kept `BACKUP_KEEP_DAYS` days). Copy that folder off the server (rclone/S3) for real disaster recovery.
  Restore: `gunzip -c backups/db-DATE.sql.gz | docker compose exec -T db psql -U $DB_USER $DB_NAME`.
* **Update:** `git pull && docker compose up -d --build` (migrations run automatically).
* **Logs:** `docker compose logs -f web`.
* **CDN / object storage:** set `STATIC_URL_OVERRIDE` / `MEDIA_URL_OVERRIDE`; static files are already fingerprinted and compressed.
* **Several web workers/servers:** set `REDIS_URL` so rate limits and the cache are shared.
* **CI:** `.github/workflows/ci.yml` runs checks, migrations check, translation check, tests and a Docker build on every push.
