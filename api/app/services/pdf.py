"""Printable per-trip PDF: context shaping, HTML rendering and PDF conversion.

Split into pure parts (`shape_trip_pdf_context` / `render_trip_html`) that are
testable without native libraries, and a thin `html_to_pdf` wrapper that imports
WeasyPrint lazily so the rest of the service works even where it is not installed.
"""

from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..couch import CouchClient
from ..errors import PdfUnavailable, TripNotFound
from ..util import utcnow_iso
from .exports import group_docs_by_type

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"


@lru_cache
def _jinja_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )


def _money(amount: float | None, currency: str) -> str | None:
    if amount is None:
        return None
    return f"{amount:.2f} {currency}".strip()


def _date_range(start: str | None, end: str | None) -> list[str]:
    try:
        start_d = date.fromisoformat(start) if start else None
        end_d = date.fromisoformat(end) if end else None
    except ValueError:
        return []
    if not start_d or not end_d or end_d < start_d:
        return []
    out: list[str] = []
    cur = start_d
    while cur <= end_d:
        out.append(cur.isoformat())
        cur += timedelta(days=1)
    return out


def shape_trip_pdf_context(docs: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Groups itinerary items per day across the trip span, lists flights and
    reservations, summarises the checklist by group, and computes the cost
    summary (estimate vs. actual, by category, with budget remaining).
    """
    grouped = group_docs_by_type(docs)
    trip = grouped["trip"][0] if grouped["trip"] else {}
    home_ccy = trip.get("homeCurrency") or "EUR"

    def _active(key: str) -> list[dict[str, Any]]:
        return [d for d in grouped.get(key, []) if not d.get("deletedAt")]

    # --- Itinerary grouped by day ---
    items = _active("itineraryItem")
    by_day: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        by_day.setdefault(item.get("date") or "__unscheduled__", []).append(item)
    for day_items in by_day.values():
        day_items.sort(key=lambda x: (x.get("order") or 0, x.get("startTime") or ""))

    ordered = _date_range(trip.get("startDate"), trip.get("endDate"))
    seen = set(ordered)
    day_blocks: list[dict[str, Any]] = [
        {"date": d, "label": d, "items": by_day.get(d, [])} for d in ordered
    ]
    for d in sorted(k for k in by_day if k != "__unscheduled__" and k not in seen):
        day_blocks.append({"date": d, "label": d, "items": by_day[d]})
    if "__unscheduled__" in by_day:
        day_blocks.append(
            {"date": None, "label": "Unscheduled", "items": by_day["__unscheduled__"]}
        )

    # --- Flights & reservations ---
    flights = sorted(_active("flight"), key=lambda x: x.get("order") or 0)
    reservations = sorted(_active("reservation"), key=lambda x: x.get("order") or 0)

    # --- Checklist grouped ---
    checklist = _active("checklistItem")
    groups: dict[str, list[dict[str, Any]]] = {}
    for citem in checklist:
        groups.setdefault(citem.get("group") or "Other", []).append(citem)
    checklist_groups = []
    for name in sorted(groups):
        rows = sorted(groups[name], key=lambda x: (x.get("order") or 0))
        checklist_groups.append(
            {
                "name": name,
                "items": rows,
                "done": sum(1 for i in rows if i.get("done")),
                "total": len(rows),
            }
        )

    # --- Cost summary ---
    expenses = _active("expense")
    by_cat: dict[str, dict[str, float]] = {}
    total_est = 0.0
    total_act = 0.0
    for exp in expenses:
        est = float(exp.get("amountEstimate") or 0)
        act = float(exp.get("amountActual") or 0)
        total_est += est
        total_act += act
        agg = by_cat.setdefault(exp.get("category") or "other", {"estimate": 0.0, "actual": 0.0})
        agg["estimate"] += est
        agg["actual"] += act

    budget_total = (trip.get("budget") or {}).get("total")
    cost_rows = [
        {
            "category": cat,
            "estimate": _money(vals["estimate"], home_ccy),
            "actual": _money(vals["actual"], home_ccy),
        }
        for cat, vals in sorted(by_cat.items())
    ]
    costs = {
        "homeCurrency": home_ccy,
        "totalEstimate": _money(total_est, home_ccy),
        "totalActual": _money(total_act, home_ccy),
        "budget": _money(budget_total, home_ccy) if budget_total is not None else None,
        "remaining": (
            _money(budget_total - total_act, home_ccy) if budget_total is not None else None
        ),
        "rows": cost_rows,
        "hasData": bool(expenses),
    }

    raw_dests = [d for d in trip.get("destinations", []) if isinstance(d, dict) and d.get("name")]
    
    def _find_dest(date_str: str | None) -> str | None:
        if not date_str or not raw_dests:
            return None
        for d in raw_dests:
            arr = d.get("arriveDate")
            dep = d.get("departDate")
            if arr and dep:
                if arr <= date_str <= dep:
                    return d.get("name")
            elif arr and not dep:
                if date_str >= arr:
                    return d.get("name")
            elif not arr and dep:
                if date_str <= dep:
                    return d.get("name")
        return None

    for block in day_blocks:
        block["destination"] = _find_dest(block.get("date"))

    destinations = " → ".join(d.get("name", "").strip() for d in raw_dests)
    done = sum(1 for c in checklist if c.get("done"))

    return {
        "trip": trip,
        "destinations": destinations,
        "days": day_blocks,
        "flights": flights,
        "reservations": reservations,
        "checklist_groups": checklist_groups,
        "checklist_progress": {"done": done, "total": len(checklist)},
        "costs": costs,
        "generatedAt": utcnow_iso(),
    }


def render_trip_html(context: dict[str, Any]) -> str:
    """Render the trip PDF HTML from the shaped context (no native deps)."""
    return _jinja_env().get_template("trip_pdf.html").render(**context)


def html_to_pdf(html: str, *, base_url: str | None = None) -> bytes:
    """Convert HTML to PDF bytes via WeasyPrint (imported lazily).

    Raises `class: ~app.errors.PdfUnavailable` if WeasyPrint or its native
    libraries cannot be loaded in this environment.
    """
    try:
        from weasyprint import HTML  # lazy import is intentional
    except Exception as exc:  # pragma: no cover - depends on the environment
        raise PdfUnavailable(
            "WeasyPrint is not available; install 'weasyprint' and its native "
            "dependencies (Pango, cairo, GDK-PixBuf) to enable PDF export."
        ) from exc
    return HTML(string=html, base_url=base_url).write_pdf()


async def build_trip_pdf(couch: CouchClient, trip_id: str) -> tuple[bytes, str]:
    """Fetch a trip, render its printable PDF, and return `(bytes, filename)`."""
    docs = await couch.get_trip_docs(trip_id)
    if not any(d.get("type") == "trip" for d in docs):
        raise TripNotFound(trip_id)
    context = shape_trip_pdf_context(docs)
    pdf_bytes = html_to_pdf(render_trip_html(context))
    title = (context["trip"].get("title") or "trip").strip().lower().replace(" ", "-")
    safe_title = "".join(ch for ch in title if ch.isalnum() or ch in "-_") or "trip"
    return pdf_bytes, f"itinera-{safe_title}.pdf"
    