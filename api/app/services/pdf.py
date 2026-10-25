"""Printable per-trip PDF: context shaping, HTML rendering and PDF conversion.

Split into pure parts (`shape_trip_pdf_context` / `render_trip_html`) that are
testable without native libraries, and a thin `html_to_pdf` wrapper that imports
WeasyPrint lazily so the rest of the service works even where it is not installed.
"""

from __future__ import annotations

import base64
import html
import re
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..couch import CouchClient
from ..errors import PdfUnavailable, TripNotFound
from ..i18n import get_i18n
from ..util import utcnow_iso
from .exports import group_docs_by_type
from .money import (
    budget_remaining,
    convert_to_home,
    expense_amounts,
    rollup_by_category,
    rollup_by_day,
    sum_expenses,
)

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
FONTS_DIR = STATIC_DIR / "fonts"

SAFE_URL = re.compile(r"^(https?://|mailto:)", re.IGNORECASE)

WEEKDAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def _format_day_label(d_obj: date | None, fallback: str, lang: str = "en") -> str:
    if not d_obj:
        return fallback
    if lang == "pt-BR":
        weekday = WEEKDAYS_PT[d_obj.weekday()]
        month = MONTHS_PT[d_obj.month - 1]
        return f"{weekday}, {d_obj.day:02d} de {month}"
    return d_obj.strftime("%a, %b %d")


# CLDR symbol per (locale, currency), copied from what `Intl.NumberFormat` — the
# formatter every screen uses — actually prints. The two locales genuinely
# disagree about the symbol itself (en-US prints "$" and "¥", pt-BR prints "US$"
# and "JP¥"), so one shared table cannot serve both.
CURRENCY_SYMBOLS: dict[str, dict[str, str]] = {
    "en": {
        "BRL": "R$",
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
        "JPY": "¥",
        "CAD": "CA$",
        "AUD": "A$",
        "CHF": "CHF",
        "CLP": "CLP",
        "ARS": "ARS",
        "MXN": "MX$",
        "SEK": "SEK",
    },
    "pt-BR": {
        "BRL": "R$",
        "USD": "US$",
        "EUR": "€",
        "GBP": "£",
        "JPY": "JP¥",
        "CAD": "CA$",
        "AUD": "AU$",
        "CHF": "CHF",
        "CLP": "CLP",
        "ARS": "ARS",
        "MXN": "MX$",
        "SEK": "SEK",
    },
}


def _to_home(
    amount: Any, currency: Any, home_currency: str, fx_rate: Any = None
) -> float | None:
    """Named seam kept for the PDF tests; delegates to `money.convert_to_home()`.

    There is exactly one implementation of the conversion rule (a foreign amount
    with no rate is excluded, not summed), so the printed sheet and the phone
    cannot drift apart. See `app/services/money.py` for why that matters.
    """
    return convert_to_home(amount, currency, home_currency, fx_rate)


def _missing_rate(exp: dict[str, Any], home_currency: str) -> bool:
    """True when a foreign amount exists but no rate was entered for it."""
    return expense_amounts(exp, home_currency).missing_rate


def _money(amount: float | None, ccy: str, lang: str = "en") -> str | None:
    """
    Format an amount the way the web app's `formatMoney()` does.

    Parity here is not cosmetic: the server-rendered PDF and the browser's own
    printable view are both called "the trip PDF", and a total that reads
    "€ 1.234,56" in one and "€1.234,56" in the other makes the reader doubt the
    number. The rules below are the ones CLDR prescribes and `Intl` implements:

    - pt-BR: `R$ 1.234,56` — comma decimal separator, always a space after the
      symbol;
    - en-US: `€1,234.56` — no space when the symbol is at most two characters
      wide, one space when it is longer (`CHF 1,234.56`, `CLP 1,234.56`);
    - a negative amount puts the sign before the symbol (`-€1,234.56`).
    """
    if amount is None:
        return None
    locale = "pt-BR" if lang == "pt-BR" else "en"
    curr_upper = (ccy or "EUR").upper().strip() or "EUR"
    # An unrecognised currency is printed as its own ISO code, which is what
    # `Intl` does too, and its 3 characters always take a space.
    symbol = CURRENCY_SYMBOLS.get(locale, {}).get(curr_upper, curr_upper)

    magnitude = abs(amount)
    if locale == "pt-BR":
        formatted = f"{magnitude:,.2f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".")
        text = f"{symbol} {formatted}"
    else:
        formatted = f"{magnitude:,.2f}"
        text = f"{symbol}{formatted}" if len(symbol) <= 2 else f"{symbol} {formatted}"
    return f"-{text}" if amount < 0 else text


# Labels for the values that live in a closed set — an itinerary item's or an
# expense's `category`, a reservation's `kind` — and the couple of cover-sheet
# words the shared dictionary has no key for. The screens label these through
# `t('cat_food')` &c.; the shared dictionary (`app/i18n.py`) already carries a
# `cat_*` key for most of them, and the ones it has no key for are here, next to
# the template that prints them. Keep this in step with
# `web/src/lib/components/itinerary/categories.ts`, `costs/labels.ts` and
# `reservations/kinds.ts`: the paper and the screen using different words for
# the same category is the bug this table exists to prevent.
EXTRA_TERM_LABELS: dict[str, dict[str, str]] = {
    "en": {
        "sightseeing": "Sightseeing",
        "activity": "Activity",
        "free": "Free time",
        "car": "Car rental",
        "restaurant": "Restaurant",
        "contents": "Contents",
        "travelers": "Travelers",
    },
    "pt-BR": {
        "sightseeing": "Passeios",
        "activity": "Atividade",
        "free": "Tempo livre",
        "car": "Aluguel de carro",
        "restaurant": "Restaurante",
        "contents": "Índice",
        "travelers": "Viajantes",
    },
}


def _term_label(value: Any, lang: str, i18n_dict: dict[str, str]) -> str:
    """
    The label a stored category/kind — or a cover-sheet word — prints as.

    Resolution order: the shared dictionary's `cat_<value>` key first, because
    that is where the screens' labels live and where a new category should get
    one; then `EXTRA_TERM_LABELS`, for the closed-set values and cover words
    with no key there; then the stored value itself, so a category written by a
    newer client prints as itself rather than as an empty chip or the key name.

    An empty value reads as the localised "Other" — the same word the costs
    rollup uses for an expense with no category.
    """
    raw = str(value).strip() if value is not None and value != "" else ""
    if not raw:
        return i18n_dict["other"]
    key = raw.lower()
    return i18n_dict.get(f"cat_{key}") or EXTRA_TERM_LABELS.get(lang, {}).get(key) or raw


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


def _safe_date(value: str | None) -> date | None:
    """`date.fromisoformat` for values that may be blank or malformed.

    Trip documents are user data arriving over CouchDB, so a hand-edited or
    half-synced `startDate` is a real possibility and must not take the whole
    PDF down. Three call sites had grown their own `try/except ValueError:
    pass` around this, which is what made it worth naming.
    """
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


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


def _cover_date_range(start: str | None, end: str | None, lang: str) -> str:
    """The trip's dates as one localised line on the cover sheet.

    A malformed date falls back to the stored string rather than dropping the
    date from the cover; `_safe_date` has already decided it is not a date.
    """
    start_label = _format_day_label(_safe_date(start), start or "", lang)
    end_label = _format_day_label(_safe_date(end), end or "", lang)
    if start_label and end_label and end_label != start_label:
        return f"{start_label} – {end_label}"  # noqa: RUF001
    return start_label or end_label


def _paper_css(paper: str | None) -> str:
    """CSS page-size keyword for `?paper=`; anything but "letter" is A4."""
    return "letter" if (paper or "").strip().lower() == "letter" else "A4"


def _parse_minutes(val: str | None) -> int | None:
    if not val or not isinstance(val, str):
        return None
    time_str = val.split("T")[1] if "T" in val else val
    m = re.match(r"^(\d{1,2}):(\d{2})", time_str)
    if m:
        return int(m.group(1)) * 60 + int(m.group(2))
    return None


def shape_trip_pdf_context(
    docs: list[dict[str, Any]], lang: str | None = None
) -> dict[str, Any]:
    """
    Groups itinerary items per day across the trip span, lists flights and
    reservations, summarises the checklist by group, and computes the cost
    summary (estimate vs. actual, by category, with budget remaining).
    """
    grouped = group_docs_by_type(docs)
    trip = grouped["trip"][0] if grouped["trip"] else {}
    home_ccy = trip.get("homeCurrency") or "EUR"

    effective_lang = "pt-BR" if (lang or trip.get("locale") or trip.get("lang") or "").lower().replace("-", "_").startswith("pt") else "en"
    i18n_dict = get_i18n(effective_lang)

    def _active(key: str) -> list[dict[str, Any]]:
        return [d for d in grouped.get(key, []) if not d.get("deletedAt")]

    # --- Itinerary grouped by day ---
    items = _active("itineraryItem")
    by_day: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        by_day.setdefault(item.get("date") or "__unscheduled__", []).append(item)
    for day_items in by_day.values():
        day_items.sort(key=lambda x: (x.get("order") or 0, x.get("startTime") or ""))
        for item in day_items:
            # Labelled only where there IS a category: falling through to the
            # "Other" default would put a chip on every uncategorised item.
            if item.get("category"):
                item["category_label"] = _term_label(item["category"], effective_lang, i18n_dict)

    ordered = _date_range(trip.get("startDate"), trip.get("endDate"))
    seen = set(ordered)
    day_blocks: list[dict[str, Any]] = []
    for d in ordered:
        lbl = _format_day_label(_safe_date(d), d, effective_lang)
        day_blocks.append({"date": d, "label": lbl, "items": by_day.get(d, [])})

    for d in sorted(k for k in by_day if k != "__unscheduled__" and k not in seen):
        lbl = _format_day_label(_safe_date(d), d, effective_lang)
        day_blocks.append({"date": d, "label": lbl, "items": by_day[d]})

    if "__unscheduled__" in by_day:
        day_blocks.append(
            {"date": None, "label": i18n_dict["unscheduled"], "items": by_day["__unscheduled__"]}
        )

    # --- Flights & reservations ---
    flights = sorted(_active("flight"), key=lambda x: x.get("order") or 0)
    reservations = sorted(_active("reservation"), key=lambda x: x.get("order") or 0)
    for res in reservations:
        # `kind` is an enum, not user text: the template used to print the
        # stored value, so a Portuguese document said "restaurant".
        if res.get("kind"):
            res["kind_label"] = _term_label(res["kind"], effective_lang, i18n_dict)

    # --- Checklist grouped ---
    checklist = _active("checklistItem")
    groups: dict[str, list[dict[str, Any]]] = {}
    for citem in checklist:
        # The group name is the user's own text and stays as written; only the
        # fallback for an ungrouped item is translated — it used to be the
        # English word "Other", which a pt-BR checklist printed verbatim.
        groups.setdefault(citem.get("group") or i18n_dict["other"], []).append(citem)
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
    #
    # Aggregated by `services/money.py`, which mirrors the web app's
    # `db/money.ts` expression for expression — including the `per_person`
    # multiplier the screen applies. The PDF used to sum the raw home-currency
    # conversions without it, so an expense entered as "120 per person" for four
    # travellers printed 120 on paper and 480 on the phone.
    expenses = _active("expense")
    traveler_count = max(int(trip.get("travelerCount") or 1), 1)
    totals = sum_expenses(expenses, home_ccy, traveler_count)
    by_cat = rollup_by_category(expenses, home_ccy, traveler_count)

    budget_total = (trip.get("budget") or {}).get("total")
    cost_rows = [
        {
            # `category` stays the raw rollup key (it is what the table sorts
            # and groups by); `label` is what the document prints.
            "category": cat,
            "label": _term_label(cat, effective_lang, i18n_dict),
            "estimate": _money(vals.estimate, home_ccy, effective_lang),
            "actual": _money(vals.actual, home_ccy, effective_lang),
        }
        for cat, vals in sorted(by_cat.items())
    ]
    costs = {
        "homeCurrency": home_ccy,
        "totalEstimate": _money(totals.estimate, home_ccy, effective_lang),
        "totalActual": _money(totals.actual, home_ccy, effective_lang),
        "budget": _money(budget_total, home_ccy, effective_lang) if budget_total is not None else None,
        # `budget_remaining` tolerates a stored string and a missing budget,
        # where the previous subtraction would have raised on either.
        "remaining": _money(
            budget_remaining(totals.actual, budget_total), home_ccy, effective_lang
        ),
        "rows": cost_rows,
        "hasData": bool(expenses),
        # Surfaced in the template so a total that quietly omits an amount says so.
        "missingRateCount": totals.missing_rate_count,
    }

    raw_dests = [d for d in trip.get("destinations", []) if isinstance(d, dict) and d.get("name")]
    
    def _find_dest(date_str: str | None) -> str | None:
        if not date_str or not raw_dests:
            return None
        for d in raw_dests:
            arr = d.get("arriveDate")
            dep = d.get("departDate")
            if arr and dep and arr <= date_str <= dep:
                return d.get("name")
            if arr and not dep and date_str >= arr:
                return d.get("name")
            if dep and not arr and date_str <= dep:
                return d.get("name")
        return None

    # Expenses by date, so a day subtotal is the SUM OF THAT DAY'S EXPENSES —
    # the figure the itinerary screen shows under "Day subtotal" — rather than a
    # sum of item estimates, which double-counts anything also recorded as an
    # expense and mixes currencies. `rollup_by_day` applies the same
    # `actual ?? estimate` and `per_person` rules as the totals above.
    day_rollup = rollup_by_day(expenses, home_ccy, traveler_count)
    expenses_by_date = {day.date: day.totals.spent for day in day_rollup.days if day.date}

    for block in day_blocks:
        block["destination"] = _find_dest(block.get("date"))
        for item in block.get("items", []):
            cost = item.get("estCost")
            if cost is None:
                continue
            # The item's own money is shown in the item's own currency — that is
            # the number on the booking — and never added to a home-currency sum.
            ccy = item.get("currency") or home_ccy
            item["formatted_cost"] = _money(float(cost), ccy, effective_lang)
            if traveler_count > 1:
                item["formatted_cost_pp"] = _money(
                    float(cost) / traveler_count, ccy, effective_lang
                )
        day_total = expenses_by_date.get(str(block.get("date") or ""), 0.0)
        if day_total > 0:
            block["total_cost_formatted"] = _money(day_total, home_ccy, effective_lang)
            if traveler_count > 1:
                block["total_cost_pp_formatted"] = _money(
                    day_total / traveler_count, home_ccy, effective_lang
                )

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
            day_label = _format_day_label(
                _safe_date(day_date), day_date, effective_lang
            )

            timed_events: list[dict[str, Any]] = []
            all_day_events: list[dict[str, Any]] = []

            for item in block.get("items", []):
                start_m = _parse_minutes(item.get("startTime"))
                cat = item.get("category") or "other"
                title = item.get("title") or i18n_dict["untitled"]
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
            range_label = (
                f"{c_days[0]['label']} – {c_days[-1]['label']}"  # noqa: RUF001
            )

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

    # --- Cover sheet ---
    #
    # Page one says what the document is before the reader turns it: title,
    # dates, places and party size, then only the sections with something in
    # them. A contents entry pointing at an empty section is how a reader ends
    # up flipping through "No flights recorded."
    contents: list[dict[str, str]] = []
    if calendar_grid["has_data"]:
        contents.append({"id": "overview", "label": i18n_dict["trip_overview"]})
    if day_blocks:
        contents.append({"id": "itinerary", "label": i18n_dict["itinerary"]})
    if flights:
        contents.append({"id": "flights", "label": i18n_dict["flights"]})
    if reservations:
        contents.append({"id": "reservations", "label": i18n_dict["reservations"]})
    if checklist:
        contents.append({"id": "checklist", "label": i18n_dict["checklist"]})
    if costs["hasData"]:
        contents.append({"id": "costs", "label": i18n_dict["costs"]})

    raw_title = trip.get("title")
    raw_start = trip.get("startDate")
    raw_end = trip.get("endDate")
    cover = {
        "title": (raw_title.strip() if isinstance(raw_title, str) else "")
        or i18n_dict["untitled_trip"],
        "dateRange": _cover_date_range(raw_start, raw_end, effective_lang),
        # Machine-readable twin of the printed line, so a screen reader or a
        # parser gets the dates the way they are stored, not only the way they
        # are worded.
        "dateRangeISO": (
            f"{raw_start}/{raw_end}" if raw_start and raw_end else raw_start or raw_end or ""
        ),
        "destinations": destinations,
        "travelerCount": traveler_count,
        "travelersLabel": _term_label("travelers", effective_lang, i18n_dict),
        "contentsLabel": _term_label("contents", effective_lang, i18n_dict),
        "sections": contents,
    }

    return {
        "trip": trip,
        "destinations": destinations,
        "cover": cover,
        "days": day_blocks,
        "flights": flights,
        "reservations": reservations,
        "checklist_groups": checklist_groups,
        "checklist_progress": {"done": done, "total": len(checklist)},
        "costs": costs,
        "calendar_grid": calendar_grid,
        "generatedAt": utcnow_iso(),
        "i18n": i18n_dict,
        "lang": effective_lang,
    }



@lru_cache(maxsize=1)
def _font_face_css() -> str:
    """
    `@font-face` rules with the woff2 files inlined as `data:` URIs.

    WeasyPrint resolves nothing implicitly: without these, every `font-family:
    "Fraunces"` and `"Inter"` in the template (and in the `@page` footer) fell
    back to the container's DejaVu, so the printed document did not look like the
    app and Portuguese accents in the headings rendered in a different typeface
    from the body. Inlining rather than linking keeps `render_trip_html` a pure
    function of the context and removes any dependency on a working directory or
    a served `/static` path.
    """
    families = [
        ("Inter", "inter-latin-{weight}-normal.woff2", "normal"),
        ("Fraunces", "fraunces-latin-{weight}-normal.woff2", "normal"),
    ]
    rules: list[str] = []
    for family, pattern, style in families:
        for weight in (400, 600, 700):
            path = FONTS_DIR / pattern.format(weight=weight)
            if not path.exists():
                continue
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
            rules.append(
                "@font-face {"
                f" font-family: '{family}';"
                f" font-style: {style};"
                f" font-weight: {weight};"
                " font-display: block;"
                f" src: url(data:font/woff2;base64,{encoded}) format('woff2');"
                " }"
            )
    return "\n".join(rules)


def render_trip_html(context: dict[str, Any], paper: str | None = None) -> str:
    """Render the trip PDF HTML from the shaped context (no native deps)."""
    return (
        _jinja_env()
        .get_template("trip_pdf.html")
        .render(
            font_face_css=_font_face_css(),
            paper_size=_paper_css(paper),
            **context,
        )
    )


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

    def _write(*, pdf_variant: str | None) -> bytes:
        try:
            return HTML(string=html, base_url=base_url).write_pdf(pdf_variant=pdf_variant)
        except TypeError:
            # Older WeasyPrint without the `pdf_variant` keyword: emit an
            # untagged PDF rather than failing the whole export.
            return HTML(string=html, base_url=base_url).write_pdf()

    # `pdf/ua-1` adds the tagged structure tree, document language and title
    # metadata that a screen reader needs. It is a nice-to-have, not a
    # correctness requirement, so a failure here degrades instead of erroring.
    try:
        return _write(pdf_variant="pdf/ua-1")
    except Exception:  # pragma: no cover - depends on the WeasyPrint build
        return _write(pdf_variant=None)


async def build_trip_pdf(
    couch: CouchClient, trip_id: str, lang: str | None = None, paper: str | None = None
) -> tuple[bytes, str]:
    """Fetch a trip, render its printable PDF, and return `(bytes, filename)`."""
    docs = await couch.get_trip_docs(trip_id)
    if not any(d.get("type") == "trip" for d in docs):
        raise TripNotFound(trip_id)
    context = shape_trip_pdf_context(docs, lang=lang)
    pdf_bytes = html_to_pdf(render_trip_html(context, paper=paper))
    # The filename deliberately does not carry the language: it names the trip,
    # and the language already travels in the `?lang=` the caller asked with, in
    # the document's own `/Lang` and in the `<html lang>` a screen reader
    # follows. A `-pt-BR` suffix would only outlive the download in a folder.
    title = (context["trip"].get("title") or "trip").strip().lower().replace(" ", "-")
    safe_title = "".join(ch for ch in title if ch.isalnum() or ch in "-_") or "trip"
    return pdf_bytes, f"itinera-{safe_title}.pdf"
    