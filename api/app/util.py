"""Tiny shared helpers (timestamps, slugs). Kept dependency-free and pure."""

from __future__ import annotations

import re
from datetime import UTC, datetime


def utcnow() -> datetime:
    """Timezone-aware current UTC time."""
    return datetime.now(UTC)


def utcnow_iso() -> str:
    """ISO 8601 UTC timestamp, e.g. `2026-06-23T10:11:12.345678+00:00`."""
    return utcnow().isoformat()


def timestamp_slug(when: datetime | None = None) -> str:
    """Sortable, filesystem-safe UTC stamp, e.g. `20260623T101122`."""
    when = when or utcnow()
    return when.astimezone(UTC).strftime("%Y%m%dT%H%M%S")


def safe_filename(value: str) -> str:
    """Make a value safe to use as a single path segment.

    Strips path separators and other unsafe characters. Dot-only results
    (`'.'`, `'..'`, ...) and empty results are neutralized to `"unnamed"` so
    a crafted value can never become a traversal segment when writing files.
    """
    cleaned = re.sub(r"[^A-Za-z0-9-_.]+", "_", value.strip()).strip("_")
    if not cleaned or re.fullmatch(r"\.+", cleaned):
        return "unnamed"
    return cleaned