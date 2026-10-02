FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DJANGO_DEBUG=0 MEDIA_ROOT=/data/media PRIVATE_MEDIA_ROOT=/data/private
WORKDIR /app

COPY requirements.txt requirements-prod.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-prod.txt

COPY . .
RUN useradd --create-home app && mkdir -p /data/media /data/private && chown -R app /data /app
USER app

# collectstatic needs no DB; a throw-away key is enough at build time
RUN DJANGO_SECRET_KEY=build-only DJANGO_ALLOWED_HOSTS=localhost python manage.py collectstatic --noinput

EXPOSE 8000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
