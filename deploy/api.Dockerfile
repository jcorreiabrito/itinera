# api.Dockerfile – the FastAPI helper service.
#
# Build context MUST be the repo root `itinera/` (see docker-compose.yml) so this
# can COPY api/ (the FastAPI app + pyproject.toml).
#
# The app reads: COUCHDB_URL, COUCHDB_USER, COUCHDB_PASSWORD, COUCHDB_DB,
# EXPORT_DIR. It creates the `itinera` DB + Mango indexes on startup.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    EXPORT_DIR=/data/exports

WORKDIR /app

# WeasyPrint (GET /api/trips/{tripId}/print.pdf) needs native libraries for text
# shaping (Pango), 2D rendering (Cairo) and image decoding (gdk-pixbuf); without
# them the PDF route returns 503. fonts-dejavu provides a baseline font so PDFs
# aren't blank. --no-install-recommends + cleaning apt lists keeps the image lean.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libcairo2 \
        libgdk-pixbuf-2.0-0 \
        libffi-dev \
        shared-mime-info \
        fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

# Install the helper service and its dependencies declared in api/pyproject.toml.
# `uvicorn[standard]` is added explicitly so the documented entrypoint always works
# even if it isn't pinned as a project dependency.
COPY api/ /app/
RUN pip install . "uvicorn[standard]"

# Exports/backups land here (mounted as a named volume in compose).
RUN mkdir -p /data/exports

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]