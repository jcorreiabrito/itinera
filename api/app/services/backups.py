"""Backup orchestration: dump CouchDB to JSON + attachment files on disk.

A backup is a timestamped folder under `EXPORT_DIR`::

    backup-2026023T101122/
        full-export.json       # faithful whole-DB document dump
        manifest.json          # summary + attachment manifest
        attachments/<docId>/<name>

This satisfies NFR-5 (one-command backup): copy/snapshot one folder to restore.
"""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Any

from ..config import Settings
from ..couch import CouchClient
from ..util import safe_filename, timestamp_slug, utcnow_iso
from .exports import build_attachment_manifest, shape_full_export

logger = logging.getLogger("itinera.backups")

BACKUP_PREFIX = "backup-"


async def run_backup(couch: CouchClient, settings: Settings) -> dict[str, Any]:
    """Write a full backup to `EXPORT_DIR` and (optionally) compact CouchDB.

    Returns a summary dict describing what was written.
    """
    export_root = settings.export_path
    export_root.mkdir(parents=True, exist_ok=True)

    # Include soft-deleted docs so a restore is byte-faithful (Trash survives).
    docs = await couch.get_all_docs(include_deleted=True)
    manifest = build_attachment_manifest(docs)

    backup_dir = export_root / f"{BACKUP_PREFIX}{timestamp_slug()}"
    backup_dir.mkdir(parents=True, exist_ok=True)

    # 1) Document dump.
    (backup_dir / "full-export.json").write_text(
        json.dumps(shape_full_export(docs, couch.db), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 2) Attachment binaries.
    attachments_dir = backup_dir / "attachments"
    written_attachments = 0
    failed_attachments: list[dict[str, str]] = []
    for entry in manifest:
        doc_id = entry.get("docId")
        name = entry.get("name")
        if not doc_id or not name:
            continue
        try:
            data = await couch.fetch_attachment(doc_id, name)
        except Exception as exc:  # pragma: no cover - network/IO failure path
            logger.warning("Could not fetch attachment %s/%s: %s", doc_id, name, exc)
            failed_attachments.append({"docId": doc_id, "name": name, "error": str(exc)})
            continue
        target = attachments_dir / safe_filename(doc_id) / safe_filename(name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        written_attachments += 1

    # 3) Manifest / summary.
    summary = {
        "name": backup_dir.name,
        "createdAt": utcnow_iso(),
        "db": couch.db,
        "docCount": len(docs),
        "attachmentCount": len(manifest),
        "attachmentsWritten": written_attachments,
        "failedAttachments": failed_attachments,
        "attachments": manifest,
    }
    (backup_dir / "manifest.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 4) Housekeeping: compaction + retention.
    compacted = False
    if settings.compact_on_backup:
        try:
            compacted = await couch.compact()
        except Exception as exc:  # pragma: no cover - best-effort housekeeping
            logger.warning("Compaction request failed: %s", exc)

    pruned = prune_old_backups(settings)

    result = {**summary, "path": str(backup_dir), "compacted": compacted, "pruned": pruned}
    # Drop the verbose manifest from the lightweight return value.
    result.pop("attachments", None)
    logger.info(
        "Backup %s complete: %d docs, %d/%d attachments, pruned %d",
        backup_dir.name,
        len(docs),
        written_attachments,
        len(manifest),
        len(pruned),
    )
    return result


def _backup_dirs(export_root: Path) -> list[Path]:
    if not export_root.exists():
        return []
    dirs = [p for p in export_root.iterdir() if p.is_dir() and p.name.startswith(BACKUP_PREFIX)]
    # Timestamp slugs sort lexicographically by time (newest last).
    return sorted(dirs, key=lambda p: p.name)


def _dir_size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def list_backups(settings: Settings) -> list[dict[str, Any]]:
    """List existing backup dumps (newest first) with lightweight metadata."""
    out: list[dict[str, Any]] = []
    for path in reversed(_backup_dirs(settings.export_path)):
        info: dict[str, Any] = {"name": path.name, "sizeBytes": _dir_size(path)}
        manifest_file = path / "manifest.json"
        if manifest_file.exists():
            try:
                meta = json.loads(manifest_file.read_text(encoding="utf-8"))
                info.update(
                    {
                        "createdAt": meta.get("createdAt"),
                        "docCount": meta.get("docCount"),
                        "attachmentCount": meta.get("attachmentCount"),
                    }
                )
            except (json.JSONDecodeError, OSError):  # pragma: no cover - corrupt manifest
                info["createdAt"] = None
        out.append(info)
    return out


def prune_old_backups(settings: Settings) -> list[str]:
    """Delete the oldest backups beyond `BACKUP_KEEP`. Returns removed names."""
    keep = max(settings.backup_keep, 0)
    dirs = _backup_dirs(settings.export_path)
    if keep == 0 or len(dirs) <= keep:
        return []
    removed: list[str] = []
    for path in dirs[: len(dirs) - keep]:
        shutil.rmtree(path, ignore_errors=True)
        removed.append(path.name)
    return removed
    