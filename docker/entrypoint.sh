#!/bin/sh
# Container start: migrate, optional first-run seed + admin user, then gunicorn.
set -e
python manage.py migrate --noinput
if [ "${RUN_SEED:-0}" = "1" ]; then
  python manage.py seed_sianexis
fi
if [ -n "${DJANGO_SUPERUSER_USERNAME:-}" ] && [ -n "${DJANGO_SUPERUSER_PASSWORD:-}" ]; then
  python manage.py createsuperuser --noinput --email "${DJANGO_SUPERUSER_EMAIL:-admin@example.com}" 2>/dev/null || true
fi
exec gunicorn sianexis.wsgi:application --bind 0.0.0.0:8000 --workers "${WEB_CONCURRENCY:-3}" --access-logfile - --timeout 60
