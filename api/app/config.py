"""Application settings, sourced entirely from environment variables.

No secrets are hardcoded. The CouchDB admin credential is read from the
environment (coordinated with `itinera-devops` via compose env / secrets).
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration.

    Every field maps to an UPPER_SNAKE environment variable (see the alias).
    Sensible defaults are provided for the Docker-compose topology; the only
    required setting is `COUCHDB_PASSWORD` (intentionally empty).
    """
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        populate_by_name=True,
        extra="ignore",
    )

    # --- CouchDB connection ---
    couchdb_url: str = Field("http://couchdb:5984", alias="COUCHDB_URL")
    couchdb_user: str = Field("admin", alias="COUCHDB_USER")
    couchdb_password: str = Field("", alias="COUCHDB_PASSWORD")
    couchdb_db: str = Field("itinera", alias="COUCHDB_DB")
    http_timeout_seconds: float = Field(30.0, alias="HTTP_TIMEOUT_SECONDS")

    # --- Exports / backups ---
    export_dir: str = Field("/data/exports", alias="EXPORT_DIR")
    backup_interval_hours: float = Field(24.0, alias="BACKUP_INTERVAL_HOURS")
    backup_cron: str | None = Field(None, alias="BACKUP_CRON")
    backup_keep: int = Field(14, alias="BACKUP_KEEP")
    compact_on_backup: bool = Field(True, alias="COMPACT_ON_BACKUP")

    # --- App behaviour ---
    scheduler_enabled: bool = Field(True, alias="SCHEDULER_ENABLED")
    docs_enabled: bool = Field(True, alias="DOCS_ENABLED")
    cors_origins_str: str = Field("", alias="CORS_ORIGINS")
    couch_ready_retries: int = Field(10, alias="COUCH_READY_RETRIES")
    couch_ready_backoff_seconds: float = Field(2.0, alias="COUCH_READY_BACKOFF_SECONDS")

    @property
    def export_path(self) -> Path:
        """Export backup directory as a `class:~pathlib.Path` ..."""
        return Path(self.export_dir)

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS origin parsed from a comma-separated string (empty = disable)."""
        return [o.strip() for o in self.cors_origins_str.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton used across the app."""
    return Settings()