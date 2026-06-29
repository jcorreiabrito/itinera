"""Background scheduler: periodic backups (which also trigger compaction).

Uses APScheduler's asyncio scheduler so jobs run on the same event loop as the
FastAPI app. The schedule is cron-driven when `BACKUP_CRON` is set, otherwise a
simple interval (`BACKUP_INTERVAL_HOURS`).
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI

from .services.backups import run_backup

logger = logging.getLogger("itinera.scheduler")

_BACKUP_JOB_ID = "scheduled-backup"


def build_scheduler(app: FastAPI) -> AsyncIOScheduler:
    """Create (but do not start) the scheduler with the backup job attached."""
    settings = app.state.settings
    scheduler = AsyncIOScheduler(timezone="UTC")

    async def _backup_job() -> None:
        couch = app.state.couch
        if couch is None:  # pragma: no cover - defensive
            logger.warning("Skipping scheduled backup: CouchDB client not ready")
            return
        try:
            await run_backup(couch, settings)
        except Exception:  # pragma: no cover - never let a job crash the loop
            logger.exception("Scheduled backup failed")

    if settings.backup_cron:
        trigger = CronTrigger.from_crontab(settings.backup_cron, timezone="UTC")
        logger.info("Backup schedule: cron %s", settings.backup_cron)
    else:
        trigger = IntervalTrigger(hours=settings.backup_interval_hours)
        logger.info("Backup schedule: every %s hour(s)", settings.backup_interval_hours)

    scheduler.add_job(
        _backup_job,
        trigger,
        id=_BACKUP_JOB_ID,
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    return scheduler
    