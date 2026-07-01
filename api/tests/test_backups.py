"""Unit tests for the pure helpers in app.services.backups."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.backups import BACKUP_PREFIX, _backup_dirs, list_backups, prune_old_backups

from tests.conftest import make_settings


def _create_backup(root: Path, name: str, doc_count: int = 5) -> Path:
    """Create a fake backup directory with a manifest.json."""
    d = root / name
    d.mkdir(parents=True)
    manifest = {
        "name": name,
        "createdAt": "2026-01-01T00:00:00+00:00",
        "docCount": doc_count,
        "attachmentCount": 0,
    }
    (d / "manifest.json").write_text(json.dumps(manifest))
    return d


class TestBackupDirs:
    def test_returns_empty_for_missing_root(self, tmp_path: Path):
        result = _backup_dirs(tmp_path / "nonexistent")
        assert result == []

    def test_ignores_non_backup_directories(self, tmp_path: Path):
        (tmp_path / "other-dir").mkdir()
        result = _backup_dirs(tmp_path)
        assert result == []

    def test_returns_backup_dirs_sorted_by_name(self, tmp_path: Path):
        _create_backup(tmp_path, f"{BACKUP_PREFIX}20260103T000000")
        _create_backup(tmp_path, f"{BACKUP_PREFIX}20260101T000000")
        _create_backup(tmp_path, f"{BACKUP_PREFIX}20260102T000000")
        result = _backup_dirs(tmp_path)
        names = [d.name for d in result]
        assert names == sorted(names)


class TestListBackups:
    def test_returns_newest_first(self, tmp_path: Path):
        _create_backup(tmp_path, f"{BACKUP_PREFIX}20260101T000000")
        _create_backup(tmp_path, f"{BACKUP_PREFIX}20260103T000000")
        _create_backup(tmp_path, f"{BACKUP_PREFIX}20260102T000000")
        settings = make_settings(EXPORT_DIR=str(tmp_path))
        result = list_backups(settings)
        names = [b["name"] for b in result]
        # Newest (20260103) should be first
        assert names[0] > names[-1]

    def test_reads_manifest_metadata(self, tmp_path: Path):
        _create_backup(tmp_path, f"{BACKUP_PREFIX}20260101T000000", doc_count=42)
        settings = make_settings(EXPORT_DIR=str(tmp_path))
        result = list_backups(settings)
        assert result[0]["docCount"] == 42

    def test_returns_empty_for_missing_export_dir(self, tmp_path: Path):
        settings = make_settings(EXPORT_DIR=str(tmp_path / "nope"))
        assert list_backups(settings) == []


class TestPruneOldBackups:
    def test_removes_oldest_beyond_keep(self, tmp_path: Path):
        for ts in ["20260101", "20260102", "20260103", "20260104", "20260105"]:
            _create_backup(tmp_path, f"{BACKUP_PREFIX}{ts}T000000")
        settings = make_settings(EXPORT_DIR=str(tmp_path), BACKUP_KEEP="3")
        removed = prune_old_backups(settings)
        assert len(removed) == 2
        remaining = _backup_dirs(tmp_path)
        assert len(remaining) == 3

    def test_does_nothing_when_under_limit(self, tmp_path: Path):
        _create_backup(tmp_path, f"{BACKUP_PREFIX}20260101T000000")
        settings = make_settings(EXPORT_DIR=str(tmp_path), BACKUP_KEEP="5")
        removed = prune_old_backups(settings)
        assert removed == []

    def test_does_nothing_when_keep_is_zero(self, tmp_path: Path):
        _create_backup(tmp_path, f"{BACKUP_PREFIX}20260101T000000")
        settings = make_settings(EXPORT_DIR=str(tmp_path), BACKUP_KEEP="0")
        removed = prune_old_backups(settings)
        assert removed == []
