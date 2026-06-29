"""STUB - Deferred (decision D10): auto-import from booking emails / PDFs.

This module is intentionally NOT implemented and NOT mounted in the API. It marks
where future email/PDF parsing would live (a natural Python add-on). Do not build
this out unless explicitly asked; see `docs/00-decision-log.md` (D10) and
`docs/01-requirements.md` ("Out of scope (v1)").
"""

from __future__ import annotations

from typing import Any

#: Flip to ``True`` only when the feature is actually implemented and wired up.
ENABLED = False


def parse_booking_email(raw_message: bytes) -> dict[str, Any]:  # pragma: no cover - stub
    """Planned: parse a booking email into draft flight/reservation documents."""
    raise NotImplementedError(
        "Email/PDF auto-import is deferred (D10). This is a placeholder stub."
    )


def parse_booking_pdf(raw_pdf: bytes) -> dict[str, Any]:  # pragma: no cover - stub
    """Planned: extract structured booking data from a PDF confirmation."""
    raise NotImplementedError(
        "Email/PDF auto-import is deferred (D10). This is a placeholder stub."
    )