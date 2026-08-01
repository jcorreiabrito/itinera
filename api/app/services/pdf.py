"""Printable per-trip PDF: context shaping, HTML rendering and PDF conversion.

Split into pure parts (`shape_trip_pdf_context` / `render_trip_html`) that are
testable without native libraries, and a thin `html_to_pdf` wrapper that imports
WeasyPrint lazily so the rest of the service works even where it is not installed.
"""

from __future__ import annotations

import html
import re
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

SAFE_URL = re.compile(r"^(https?://|mailto:)", re.IGNORECASE)


def _inline(raw: str) -> str:
    t = html.escape(raw)

    def _link_repl(match: re.Match[str]) -> str:
        label, url = match.group(1), match.group(2)
        decoded = url.replace("&amp;", "&")
        if not SAFE_URL.match(decoded):
            return label
        return f'<a href="{url}" class="note-link">{label}</a>'

    t = re.sub(r"\[([^\]]+)\]\(([^\s\)]+)\)", _link_repl, t)
    t = re.sub(r"`([^`]+)`", r'<code class="note-code">\1</code>', t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<!\*)\*([^*\s][^*]*[^*\s])\*(?!\*)", r"<em>\1</em>", t)
    t = re.sub(r"(?<!\*)_([^_\s][^_]*[^_\s])_(?!_)", r"<em>\1</em>", t)
    return t


def render_markdown(src: str | None) -> str:
    """Render a minimal, safe subset of Markdown to an HTML string for PDF output."""
    if not src:
        return ""

    lines = src.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    para: list[str] = []
    i = 0

    def flush_para() -> None:
        nonlocal para
        if para:
            out.append(f'<p class="note-p">{"<br>".join(_inline(x) for x in para)}</p>')
            para = []

    while i < len(lines):
        line = lines[i]
        trimmed = line.strip()

        if not trimmed:
            flush_para()
            i += 1
            continue

        # Horizontal rule
        if re.match(r"^(-{3,}|\*{3,}|_{3,})$", trimmed):
            flush_para()
            out.append('<hr class="note-hr" />')
            i += 1
            continue

        # Heading
        heading = re.match(r"^(#{1,6})\s+(.*)$", trimmed)
        if heading:
            flush_para()
            level = len(heading.group(1))
            cls = (
                "note-h1"
                if level <= 1
                else "note-h2"
                if level == 2
                else "note-h3"
            )
            out.append(f'<div class="{cls}">{_inline(heading.group(2))}</div>')
            i += 1
            continue

        # Blockquote
        if re.match(r"^>\s", trimmed):
            flush_para()
            items: list[str] = []
            while i < len(lines) and re.match(r"^>\s?", lines[i].strip()):
                items.append(re.sub(r"^>\s?", "", lines[i].strip()))
                i += 1
            quoted = "<br>".join(_inline(x) for x in items)
            out.append(f'<blockquote class="note-quote">{quoted}</blockquote>')
            continue

        # Unordered list
        if re.match(r"^[-*]\s", trimmed):
            flush_para()
            items = []
            while i < len(lines) and re.match(r"^[-*]\s", lines[i].strip()):
                items.append(re.sub(r"^[-*]\s", "", lines[i].strip()))
                i += 1
            lis = "".join(f"<li>{_inline(it)}</li>" for it in items)
            out.append(f'<ul class="note-list">{lis}</ul>')
            continue

        # Ordered list
        if re.match(r"^\d+[.]\s", trimmed):
            flush_para()
            items = []
            while i < len(lines) and re.match(r"^\d+[.]\s", lines[i].strip()):
                items.append(re.sub(r"^\d+[.]\s", "", lines[i].strip()))
                i += 1
            lis = "".join(f"<li>{_inline(it)}</li>" for it in items)
            out.append(f'<ol class="note-list-ordered">{lis}</ol>')
            continue

        # Plain paragraph line
        para.append(trimmed)
        i += 1

    flush_para()
    return "\n".join(out)


@lru_cache
def _jinja_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["markdown"] = render_markdown
    return env


CURRENCY_SYMBOLS: dict[str, str] = {
    "BRL": "R$",
    "USD": "$",
    "EUR": "€",
    "GBP": "£",
    "JPY": "¥",
    "CAD": "CA$",
    "AUD": "A$",
    "CHF": "CHF",
    "CLP": "CLP$",
    "ARS": "ARS$",
    "MXN": "MX$",
}


def _money(amount: float | None, currency: str) -> str | None:
    if amount is None:
        return None
    curr_upper = currency.upper().strip() if currency else "EUR"
    symbol = CURRENCY_SYMBOLS.get(curr_upper, curr_upper)
    if curr_upper == "BRL":
        formatted_num = f"{amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return f"{symbol} {formatted_num}"
    else:
        formatted_num = f"{amount:,.2f}"
        return f"{symbol} {formatted_num}"


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


def _parse_minutes(val: str | None) -> int | None:
    if not val or not isinstance(val, str):
        return None
    time_str = val.split("T")[1] if "T" in val else val
    m = re.match(r"^(\d{1,2}):(\d{2})", time_str)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    return None


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

    traveler_count = max(int(trip.get("travelerCount") or 1), 1)

    for block in day_blocks:
        block["destination"] = _find_dest(block.get("date"))
        day_items = block.get("items", [])
        day_total = 0.0
        for item in day_items:
            cost = item.get("estCost")
            if cost is not None:
                cost_val = float(cost)
                day_total += cost_val
                ccy = item.get("currency") or home_ccy
                item["formatted_cost"] = _money(cost_val, ccy)
                if traveler_count > 1:
                    item["formatted_cost_pp"] = _money(cost_val / traveler_count, ccy)
        if day_total > 0:
            block["total_cost_formatted"] = _money(day_total, home_ccy)
            if traveler_count > 1:
                block["total_cost_pp_formatted"] = _money(day_total / traveler_count, home_ccy)

    destinations = " → ".join(d.get("name", "").strip() for d in raw_dests)
    done = sum(1 for c in checklist if c.get("done"))

    # --- Calendar Grid Context for PDF (Chunked into max 5 days per block for legibility) ---
    MAX_DAYS_PER_CHUNK = 5
    valid_blocks = [b for b in day_blocks if b.get("date")]
    chunked_blocks = [
        valid_blocks[i : i + MAX_DAYS_PER_CHUNK]
        for i in range(0, len(valid_blocks), MAX_DAYS_PER_CHUNK)
    ]

    chunks: list[dict[str, Any]] = []

    for c_index, c_blocks in enumerate(chunked_blocks):
        if not c_blocks:
            continue

        min_min = 7 * 60
        max_min = 21 * 60
        for block in c_blocks:
            for item in block.get("items", []):
                start_m = _parse_minutes(item.get("startTime"))
                if start_m is not None:
                    end_m = _parse_minutes(item.get("endTime"))
                    if end_m is None or end_m <= start_m:
                        end_m = start_m + 60
                    min_min = min(min_min, start_m)
                    max_min = max(max_min, end_m)

        c_start_hour = max(0, min_min // 60)
        c_end_hour = min(24, max(c_start_hour + 1, (max_min + 59) // 60))
        c_total_minutes = max(60, (c_end_hour - c_start_hour) * 60)

        c_days: list[dict[str, Any]] = []
        for block in c_blocks:
            day_date = block["date"]
            d_obj = None
            try:
                d_obj = date.fromisoformat(day_date)
            except ValueError:
                pass
            day_label = d_obj.strftime("%a, %b %d") if d_obj else day_date

            timed_events: list[dict[str, Any]] = []
            all_day_events: list[dict[str, Any]] = []

            for item in block.get("items", []):
                start_m = _parse_minutes(item.get("startTime"))
                cat = item.get("category") or "other"
                title = item.get("title") or "Untitled"
                if start_m is not None:
                    end_m = _parse_minutes(item.get("endTime"))
                    if end_m is None or end_m <= start_m:
                        end_m = start_m + 60
                    top_pct = max(0.0, ((start_m - c_start_hour * 60) / c_total_minutes) * 100)
                    height_pct = max(5.0, ((end_m - start_m) / c_total_minutes) * 100)
                    start_h, start_m_rem = divmod(start_m, 60)
                    end_h, end_m_rem = divmod(end_m, 60)
                    time_range = f"{start_h:02d}:{start_m_rem:02d}"
                    if item.get("endTime"):
                        time_range += f"-{end_h:02d}:{end_m_rem:02d}"

                    loc_name = ""
                    loc = item.get("location")
                    if isinstance(loc, dict):
                        loc_name = loc.get("name") or ""

                    timed_events.append({
                        "title": title,
                        "category": cat,
                        "top_pct": round(top_pct, 2),
                        "height_pct": round(height_pct, 2),
                        "time_range": time_range,
                        "location": loc_name,
                        "formatted_cost": item.get("formatted_cost"),
                    })
                else:
                    all_day_events.append({
                        "title": title,
                        "category": cat,
                    })

            c_days.append({
                "date": day_date,
                "label": day_label,
                "destination": block.get("destination"),
                "all_day": all_day_events,
                "timed": timed_events,
            })

        range_label = ""
        if c_days:
            range_label = f"{c_days[0]['label']} – {c_days[-1]['label']}"

        chunks.append({
            "chunk_index": c_index + 1,
            "total_chunks": len(chunked_blocks),
            "start_hour": c_start_hour,
            "end_hour": c_end_hour,
            "hours": [f"{h:02d}:00" for h in range(c_start_hour, c_end_hour)],
            "days": c_days,
            "range_label": range_label,
        })

    all_calendar_days = [d for c in chunks for d in c["days"]]
    calendar_grid = {
        "chunks": chunks,
        "days": all_calendar_days,
        "start_hour": chunks[0]["start_hour"] if chunks else 7,
        "end_hour": chunks[0]["end_hour"] if chunks else 21,
        "hours": chunks[0]["hours"] if chunks else [f"{h:02d}:00" for h in range(7, 21)],
        "has_data": len(chunks) > 0 and any(len(c["days"]) > 0 for c in chunks),
    }

    return {
        "trip": trip,
        "destinations": destinations,
        "days": day_blocks,
        "flights": flights,
        "reservations": reservations,
        "checklist_groups": checklist_groups,
        "checklist_progress": {"done": done, "total": len(checklist)},
        "costs": costs,
        "calendar_grid": calendar_grid,
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
    