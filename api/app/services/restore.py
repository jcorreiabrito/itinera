"""Restore a backup dump into CouchDB.

The backup format is written by :mod:`app.services.backups`: a timestamped folder
with ``full-export.json`` (faithful documents) and ``attachments/<docId>/<name>``
binaries. This module is the inverse, and it is deliberately conservative:

* **merge** (the default) only creates documents that do not exist. It is the
  disaster-recovery case — point a fresh database at last week's backup and get
  the data back without touching anything created since.
* **replace** overwrites documents that exist, using their current ``_rev``, and
  re-uploads the backup's attachments for them. Documents that exist now but are
  absent from the backup are never deleted: a restore can add and repair, but it
  cannot destroy.

Every non-dry-run restore writes a fresh snapshot first (``run_backup``) and
aborts if that snapshot fails. A restore that goes wrong must still leave the
pre-restore state recoverable from the server itself, not from shell history.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..config import Settings
from ..couch import CouchClient
from ..util import safe_filename
from .backups import BACKUP_PREFIX, run_backup
from .exports import FULL_EXPORT_SCHEMA

logger = logging.getLogger("itinera.restore")

#: A backup directory name. Anchored and character-bounded so a crafted `name`
#: can never climb out of the export directory.
BACKUP_NAME_RE = re.compile(rf"^{re.escape(BACKUP_PREFIX)}[A-Za-z0-9_-]{{1,80}}$")

#: Metadata that belongs to a *revision*, not to the document's content. Sending
#: it back would either be rejected or resurrect a revision tree the server no
#: longer has; attachments are re-uploaded from their own files.
STRIPPED_FIELDS = frozenset({"_rev", "_conflicts", "_revisions", "_attachments", "_deleted"})


class RestoreError(ValueError):
    """A backup cannot be restored as asked (bad name, missing or invalid dump)."""


class BackupNotFound(RestoreError):
    """The named backup directory or its export file does not exist."""


@dataclass(frozen=True)
class RestorePlan:
    """What a restore would do, computed before anything is written."""

    create: tuple[dict[str, Any], ...] = ()
    replace: tuple[dict[str, Any], ...] = ()
    untouched: int = 0
    skipped: int = 0
    attachments: int = 0
    missing_attachment_files: tuple[str, ...] = field(default_factory=tuple)

    @property
    def documents(self) -> int:
        return len(self.create) + len(self.replace)

    def summary(self) -> dict[str, Any]:
        return {
            "create": len(self.create),
            "replace": len(self.replace),
            "untouched": self.untouched,
            "skipped": self.skipped,
            "attachments": self.attachments,
            "missingAttachmentFiles": list(self.missing_attachment_files),
        }


def backup_dir_for(settings: Settings, name: str) -> Path:
    """Resolve a backup name to its directory, refusing anything outside it."""
    if not BACKUP_NAME_RE.match(name):
        raise RestoreError(f"invalid backup name: {name!r}")
    root = settings.export_path.resolve()
    path = (root / name).resolve()
    if path.parent != root:
        raise RestoreError(f"backup name escapes the export directory: {name!r}")
    if not path.is_dir():
        raise BackupNotFound(f"backup not found: {name}")
    return path


def load_backup(path: Path) -> dict[str, Any]:
    """Read and validate ``full-export.json`` from a backup directory."""
    export_file = path / "full-export.json"
    if not export_file.is_file():
        raise BackupNotFound(f"backup has no full-export.json: {path.name}")
    try:
        payload = json.loads(export_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise RestoreError(f"backup export is unreadable: {exc}") from exc
    if not isinstance(payload, dict) or payload.get("schema") != FULL_EXPORT_SCHEMA:
        raise RestoreError("backup export is not an Itinera full export")
    documents = payload.get("documents")
    if not isinstance(documents, list):
        raise RestoreError("backup export has no documents list")
    return payload


def _restorable(doc: Any) -> bool:
    """True for a document body this app may write back."""
    if not isinstance(doc, dict):
        return False
    doc_id = doc.get("_id")
    if not isinstance(doc_id, str) or not doc_id or doc_id.startswith("_design/"):
        return False
    # Hard-deleted rows are not part of a full export; skip defensively rather
    # than resurrect a tombstone the user meant to be gone.
    return not doc.get("_deleted")


def restore_body(doc: dict[str, Any]) -> dict[str, Any]:
    """The writable body of a backed-up document (revision metadata removed)."""
    return {key: value for key, value in doc.items() if key not in STRIPPED_FIELDS}


def _attachment_files(path: Path, payload: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Manifest entries grouped by document id, with their on-disk paths resolved."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    for entry in payload.get("attachments") or []:
        doc_id = entry.get("docId")
        name = entry.get("name")
        if not isinstance(doc_id, str) or not isinstance(name, str) or not name:
            continue
        file_path = path / "attachments" / safe_filename(doc_id) / safe_filename(name)
        grouped.setdefault(doc_id, []).append(
            {
                "name": name,
                "mime": entry.get("mime") or "application/octet-stream",
                "path": file_path,
            }
        )
    return grouped


def plan_restore(
    backup_path: Path,
    payload: dict[str, Any],
    existing: list[dict[str, Any]],
    *,
    mode: str = "merge",
) -> RestorePlan:
    """Decide, per document, what a restore would do.

    Pure apart from the attachment file-existence check, so the route can answer
    a dry run without writing anything.
    """
    if mode not in {"merge", "replace"}:
        raise RestoreError(f"unknown restore mode: {mode!r}")

    current = {doc.get("_id"): doc for doc in existing if isinstance(doc.get("_id"), str)}
    create: list[dict[str, Any]] = []
    replace: list[dict[str, Any]] = []
    untouched = 0
    skipped = 0

    for doc in payload.get("documents") or []:
        if not _restorable(doc):
            skipped += 1
            continue
        doc_id = doc["_id"]
        body = restore_body(doc)
        if doc_id not in current:
            create.append(body)
        elif mode == "replace":
            body["_rev"] = current[doc_id].get("_rev")
            replace.append(body)
        else:
            untouched += 1

    restored_ids = {doc["_id"] for doc in create + replace}
    attachments = 0
    missing: list[str] = []
    for doc_id, entries in _attachment_files(backup_path, payload).items():
        if doc_id not in restored_ids:
            continue
        for entry in entries:
            if entry["path"].is_file():
                attachments += 1
            else:
                missing.append(f"{doc_id}/{entry['name']}")

    return RestorePlan(
        create=tuple(create),
        replace=tuple(replace),
        untouched=untouched,
        skipped=skipped,
        attachments=attachments,
        missing_attachment_files=tuple(sorted(missing)),
    )


async def _write_documents(
    couch: CouchClient, plan: RestorePlan
) -> tuple[dict[str, str], list[dict[str, Any]]]:
    """Write the plan in one bulk call. Returns (id → current rev, failures)."""
    docs = [*plan.create, *plan.replace]
    if not docs:
        return {}, []
    results = await couch.bulk_save(docs)
    revs: dict[str, str] = {}
    failures: list[dict[str, Any]] = []
    for result in results:
        doc_id = result.get("id")
        if result.get("error"):
            failures.append(
                {"id": doc_id, "error": result.get("error"), "reason": result.get("reason")}
            )
        elif isinstance(doc_id, str) and result.get("rev"):
            revs[doc_id] = result["rev"]
    return revs, failures


async def _write_attachments(
    couch: CouchClient,
    backup_path: Path,
    payload: dict[str, Any],
    revs: dict[str, str],
) -> tuple[int, list[dict[str, Any]]]:
    """Upload attachment bytes for the documents that were written."""
    written = 0
    failures: list[dict[str, Any]] = []
    for doc_id, entries in _attachment_files(backup_path, payload).items():
        rev = revs.get(doc_id)
        if not rev:
            continue  # document itself failed or was not part of this restore
        for entry in entries:
            path: Path = entry["path"]
            if not path.is_file():
                failures.append(
                    {
                        "id": doc_id,
                        "attachment": entry["name"],
                        "error": "missing_file",
                        "reason": str(path),
                    }
                )
                continue
            try:
                result = await couch.put_attachment(
                    doc_id,
                    entry["name"],
                    path.read_bytes(),
                    entry["mime"],
                    rev=rev,
                )
            except Exception as exc:  # pragma: no cover - network failure path
                failures.append(
                    {
                        "id": doc_id,
                        "attachment": entry["name"],
                        "error": "upload_failed",
                        "reason": str(exc),
                    }
                )
                continue
            written += 1
            if isinstance(result.get("rev"), str):
                rev = result["rev"]
                revs[doc_id] = rev
    return written, failures


async def restore_backup(
    couch: CouchClient,
    settings: Settings,
    name: str,
    *,
    mode: str = "merge",
    dry_run: bool = False,
) -> dict[str, Any]:
    """Restore the named backup, optionally planning only (``dry_run``)."""
    backup_path = backup_dir_for(settings, name)
    payload = load_backup(backup_path)
    existing = await couch.get_all_docs(include_deleted=True)
    plan = plan_restore(backup_path, payload, existing, mode=mode)

    result: dict[str, Any] = {
        "backup": name,
        "mode": mode,
        "dryRun": dry_run,
        "backupDb": payload.get("db"),
        "planned": plan.summary(),
        "restored": {"documents": 0, "attachments": 0},
        "failures": [],
        "snapshot": None,
    }
    if dry_run:
        return result

    # Safety first: a failed snapshot aborts before the database is touched.
    snapshot = await run_backup(couch, settings)
    result["snapshot"] = snapshot.get("name")
    logger.info("Pre-restore snapshot %s written", result["snapshot"])

    revs, failures = await _write_documents(couch, plan)
    attachments, attachment_failures = await _write_attachments(
        couch, backup_path, payload, revs
    )
    result["restored"] = {"documents": len(revs), "attachments": attachments}
    result["failures"] = [*failures, *attachment_failures]
    logger.info(
        "Restore %s (%s): %d documents, %d attachments, %d failures",
        name,
        mode,
        len(revs),
        attachments,
        len(result["failures"]),
    )
    return result
