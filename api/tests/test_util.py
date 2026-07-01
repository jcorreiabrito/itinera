"""Unit tests for app.util – pure, dependency-free helpers."""

from __future__ import annotations

import re
from datetime import UTC, datetime

import pytest

from app.util import safe_filename, timestamp_slug, utcnow, utcnow_iso


class TestUtcnow:
    def test_returns_timezone_aware(self):
        dt = utcnow()
        assert dt.tzinfo is not None
        assert dt.tzinfo.utcoffset(dt).total_seconds() == 0


class TestUtcnowIso:
    def test_returns_string(self):
        result = utcnow_iso()
        assert isinstance(result, str)

    def test_is_valid_iso_format(self):
        result = utcnow_iso()
        # Must parse back as a datetime.
        parsed = datetime.fromisoformat(result)
        assert parsed is not None

    def test_contains_utc_offset(self):
        result = utcnow_iso()
        assert "+00:00" in result or result.endswith("Z")


class TestTimestampSlug:
    def test_format(self):
        slug = timestamp_slug()
        # Expected: YYYYMMDDTHHmmSS (15 chars)
        assert re.fullmatch(r"\d{8}T\d{6}", slug), f"Unexpected slug: {slug!r}"

    def test_stable_for_fixed_datetime(self):
        dt = datetime(2026, 6, 23, 10, 11, 22, tzinfo=UTC)
        assert timestamp_slug(dt) == "20260623T101122"

    def test_converts_to_utc(self):
        from datetime import timezone, timedelta
        dt_plus2 = datetime(2026, 6, 23, 12, 11, 22, tzinfo=timezone(timedelta(hours=2)))
        # 12:11:22 +02:00 == 10:11:22 UTC
        assert timestamp_slug(dt_plus2) == "20260623T101122"


class TestSafeFilename:
    def test_passes_through_safe_value(self):
        assert safe_filename("my-file_name.json") == "my-file_name.json"

    def test_strips_forward_slash(self):
        result = safe_filename("dir/file")
        assert "/" not in result

    def test_strips_backslash(self):
        result = safe_filename("dir\\file")
        assert "\\" not in result

    def test_dots_only_becomes_unnamed(self):
        assert safe_filename(".") == "unnamed"
        assert safe_filename("..") == "unnamed"
        assert safe_filename("...") == "unnamed"

    def test_empty_string_becomes_unnamed(self):
        assert safe_filename("") == "unnamed"
        assert safe_filename("   ") == "unnamed"

    def test_unicode_stripped_to_safe_ascii(self):
        result = safe_filename("café résumé")
        # Special chars replaced, result is non-empty
        assert result != "unnamed"
        assert re.fullmatch(r"[A-Za-z0-9\-_.]+", result)

    def test_trip_id_with_colon(self):
        # Colons are unsafe characters
        result = safe_filename("trip:01ABCDEF")
        assert ":" not in result
