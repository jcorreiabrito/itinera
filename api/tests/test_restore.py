"""Tests for backup restore: planning, safety and the HTTP contract."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from app.main import create_app
from app.services.exports import FULL_EXPORT_SCHEMA
from app.services.restore import (
    BackupNotFound,
    RestoreError,
    backup_dir_for,
    load_backup,
    plan_restore,
    restore_backup,
)
from tests.conftest import json_response, make_couch, make_settings

BACKUP = "backup-20260101T120000"


def _write_backup(
    root: Path,
    documents: list[dict[str, Any]],
    *,
    name: str = BACKUP,
    attachments: list[dict[str, Any]] | None = None,
    files: dict[str, bytes] | None = None,
) -> Path:
    path = root / name
    path.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": FULL_EXPORT_SCHEMA,
        "version": 1,
        "db": "itinera_test",
        "docCount": len(documents),
        "documents": documents,
        "attachments": attachments or [],
    }
    (path / "full-export.json").write_text(json.dumps(payload), encoding="utf-8")
    for relative, data in (files or {}).items():
        target = path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    return path


class FakeCouch:
    """Duck-typed CouchClient: enough for restore and its safety snapshot."""

    db = "itinera_test"

    def __init__(self, docs: list[dict[str, Any]] | None = None) -> None:
        self.docs: dict[str, dict[str, Any]] = {d["_id"]: dict(d) for d in docs or []}
        self.uploads: list[tuple[str, str, bytes, str]] = []
        self.bulk_calls = 0

    async def get_all_docs(self, *, include_deleted: bool = False) -> list[dict[str, Any]]:
        return list(self.docs.values())

    async def bulk_save(self, docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        self.bulk_calls += 1
        out = []
        for doc in docs:
            current = self.docs.get(doc["_id"])
            if doc.get("_rev") and (not current or current.get("_rev") != doc["_rev"]):
                out.append({"id": doc["_id"], "error": "conflict"})
                continue
            generation = int(str((current or {}).get("_rev", "0-0")).split("-")[0]) + 1
            rev = f"{generation}-fake"
            self.docs[doc["_id"]] = {**doc, "_rev": rev}
            out.append({"ok": True, "id": doc["_id"], "rev": rev})
        return out

    async def put_attachment(
        self,
        doc_id: str,
        name: str,
        data: bytes,
        content_type: str,
        *,
        rev: str | None = None,
    ) -> dict[str, Any]:
        self.uploads.append((doc_id, name, data, content_type))
        current = self.docs[doc_id]
        new_rev = f"{current['_rev']}-a"
        self.docs[doc_id] = {**current, "_rev": new_rev}
        return {"ok": True, "id": doc_id, "rev": new_rev}

    async def fetch_attachment(self, doc_id: str, name: str) -> bytes:
        return b"snapshot"


class TestBackupDirFor:
    def test_accepts_a_backup_directory(self, tmp_path: Path):
        _write_backup(tmp_path, [])
        settings = make_settings(EXPORT_DIR=str(tmp_path))
        assert backup_dir_for(settings, BACKUP).name == BACKUP

    @pytest.mark.parametrize(
        "name",
        ["../etc", "backup-x/../../etc", "not-a-backup", "backup-", "backup-x/../y"],
    )
    def test_rejects_names_that_are_not_backups(self, tmp_path: Path, name: str):
        settings = make_settings(EXPORT_DIR=str(tmp_path))
        with pytest.raises(RestoreError):
            backup_dir_for(settings, name)

    def test_missing_directory_is_not_found(self, tmp_path: Path):
        settings = make_settings(EXPORT_DIR=str(tmp_path))
        with pytest.raises(BackupNotFound):
            backup_dir_for(settings, BACKUP)


class TestLoadBackup:
    def test_reads_a_valid_export(self, tmp_path: Path):
        _write_backup(tmp_path, [{"_id": "trip:1", "type": "trip"}])
        payload = load_backup(tmp_path / BACKUP)
        assert payload["documents"][0]["_id"] == "trip:1"

    def test_rejects_a_foreign_json_file(self, tmp_path: Path):
        path = tmp_path / BACKUP
        path.mkdir()
        (path / "full-export.json").write_text('{"schema": "something-else"}')
        with pytest.raises(RestoreError, match="not an Itinera full export"):
            load_backup(path)

    def test_rejects_unreadable_json(self, tmp_path: Path):
        path = tmp_path / BACKUP
        path.mkdir()
        (path / "full-export.json").write_text("{not json")
        with pytest.raises(RestoreError, match="unreadable"):
            load_backup(path)


class TestPlanRestore:
    def test_merge_only_creates_missing_documents(self, tmp_path: Path):
        payload = {
            "documents": [
                {"_id": "trip:1", "type": "trip", "title": "Backup"},
                {"_id": "trip:2", "type": "trip", "title": "New"},
            ]
        }
        existing = [{"_id": "trip:1", "_rev": "3-now", "title": "Current"}]
        plan = plan_restore(tmp_path, payload, existing, mode="merge")
        assert [d["_id"] for d in plan.create] == ["trip:2"]
        assert plan.replace == ()
        assert plan.untouched == 1

    def test_replace_writes_over_the_current_revision(self, tmp_path: Path):
        payload = {"documents": [{"_id": "trip:1", "_rev": "1-old", "title": "Backup"}]}
        existing = [{"_id": "trip:1", "_rev": "3-now", "title": "Current"}]
        plan = plan_restore(tmp_path, payload, existing, mode="replace")
        assert len(plan.replace) == 1
        assert plan.replace[0]["_rev"] == "3-now"
        assert plan.replace[0]["title"] == "Backup"

    def test_strips_revision_metadata(self, tmp_path: Path):
        payload = {
            "documents": [
                {
                    "_id": "att:1:A",
                    "_rev": "2-x",
                    "_conflicts": ["1-y"],
                    "_attachments": {"file": {"length": 3}},
                    "type": "attachment",
                }
            ]
        }
        plan = plan_restore(tmp_path, payload, [], mode="merge")
        body = plan.create[0]
        assert not ({"_rev", "_conflicts", "_attachments"} & set(body))

    def test_skips_design_and_hard_deleted_documents(self, tmp_path: Path):
        payload = {
            "documents": [
                {"_id": "_design/index", "type": "design"},
                {"_id": "trip:gone", "_deleted": True},
                {"_id": "trip:ok", "type": "trip"},
            ]
        }
        plan = plan_restore(tmp_path, payload, [], mode="merge")
        assert [d["_id"] for d in plan.create] == ["trip:ok"]
        assert plan.skipped == 2

    def test_counts_only_attachments_whose_file_is_present(self, tmp_path: Path):
        _write_backup(
            tmp_path,
            [{"_id": "att:1:A", "type": "attachment"}],
            attachments=[
                {"docId": "att:1:A", "name": "file", "mime": "image/jpeg"},
                {"docId": "att:1:A", "name": "thumb", "mime": "image/jpeg"},
            ],
            files={"attachments/att_1_A/file": b"abc"},
        )
        payload = load_backup(tmp_path / BACKUP)
        plan = plan_restore(tmp_path / BACKUP, payload, [], mode="merge")
        assert plan.attachments == 1
        assert plan.missing_attachment_files == ("att:1:A/thumb",)

    def test_unknown_mode_is_rejected(self, tmp_path: Path):
        with pytest.raises(RestoreError, match="unknown restore mode"):
            plan_restore(tmp_path, {"documents": []}, [], mode="yolo")


class TestRestoreBackup:
    async def test_merge_restores_documents_and_attachments(self, tmp_path: Path):
        _write_backup(
            tmp_path,
            [
                {"_id": "trip:1", "type": "trip", "title": "Recovered"},
                {"_id": "att:1:A", "type": "attachment"},
            ],
            attachments=[{"docId": "att:1:A", "name": "file", "mime": "image/jpeg"}],
            files={"attachments/att_1_A/file": b"jpeg-bytes"},
        )
        settings = make_settings(EXPORT_DIR=str(tmp_path))
        couch = FakeCouch()

        result = await restore_backup(couch, settings, BACKUP)

        assert result["restored"] == {"documents": 2, "attachments": 1}
        assert couch.docs["trip:1"]["title"] == "Recovered"
        assert couch.uploads == [("att:1:A", "file", b"jpeg-bytes", "image/jpeg")]
        # A safety snapshot of the pre-restore database is written first.
        assert result["snapshot"] and result["snapshot"].startswith("backup-")
        assert (tmp_path / result["snapshot"] / "full-export.json").is_file()

    async def test_merge_never_overwrites_an_existing_document(self, tmp_path: Path):
        _write_backup(tmp_path, [{"_id": "trip:1", "type": "trip", "title": "Old"}])
        settings = make_settings(EXPORT_DIR=str(tmp_path))
        couch = FakeCouch([{"_id": "trip:1", "_rev": "5-current", "title": "Newer"}])

        result = await restore_backup(couch, settings, BACKUP)

        assert couch.docs["trip:1"]["title"] == "Newer"
        assert result["restored"]["documents"] == 0
        assert result["planned"]["untouched"] == 1

    async def test_dry_run_writes_nothing_and_takes_no_snapshot(self, tmp_path: Path):
        _write_backup(tmp_path, [{"_id": "trip:1", "type": "trip"}])
        settings = make_settings(EXPORT_DIR=str(tmp_path))
        couch = FakeCouch()

        result = await restore_backup(couch, settings, BACKUP, dry_run=True)

        assert result["planned"]["create"] == 1
        assert result["snapshot"] is None
        assert couch.bulk_calls == 0
        assert len(list(tmp_path.glob("backup-*/full-export.json"))) == 1  # the fixture only

    async def test_missing_backup_raises(self, tmp_path: Path):
        settings = make_settings(EXPORT_DIR=str(tmp_path))
        with pytest.raises(BackupNotFound):
            await restore_backup(FakeCouch(), settings, BACKUP)


class TestRestoreRoute:
    async def _client(self, responses: dict) -> httpx.AsyncClient:
        settings = make_settings()
        couch = make_couch(settings, responses)
        app = create_app(settings=settings, couch=couch)
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")

    async def test_invalid_name_is_400(self):
        async with await self._client({}) as client:
            resp = await client.post("/api/backups/..%2Fetc/restore")
        assert resp.status_code in (400, 404)

    async def test_missing_backup_is_404(self):
        async with await self._client({}) as client:
            resp = await client.post(f"/api/backups/{BACKUP}/restore")
        assert resp.status_code == 404

    async def test_dry_run_reports_the_plan(self, tmp_path: Path):
        _write_backup(tmp_path, [{"_id": "trip:1", "type": "trip", "title": "Paris"}])
        settings = make_settings(EXPORT_DIR=str(tmp_path))
        responses = {
            ("GET", "/itinera_test/_all_docs"): json_response({"rows": []}),
            ("PUT", "/itinera_test"): httpx.Response(412, json={}),
        }
        couch = make_couch(settings, responses)
        app = create_app(settings=settings, couch=couch)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            resp = await client.post(f"/api/backups/{BACKUP}/restore?dry_run=true")
        assert resp.status_code == 200
        assert resp.json()["planned"]["create"] == 1
