"""Unit tests for the pure helpers in app.services.pdf."""

from __future__ import annotations

import pytest
from app.services.pdf import (
    _date_range,
    _missing_rate,
    _money,
    _to_home,
    render_markdown,
    render_trip_html,
    shape_trip_pdf_context,
)


class TestMoney:
    """
    These pin the exact strings `Intl.NumberFormat` produces in the browser, so
    the server-rendered PDF and the app's own printable view cannot disagree
    about what a number looks like. Values verified against Node:

        new Intl.NumberFormat('en-US', {style:'currency', currency:'EUR'}).format(1234.56)
    """

    def test_en_short_symbol_takes_no_space(self):
        assert _money(1234.56, "EUR") == "€1,234.56"

    def test_en_long_symbol_takes_a_space(self):
        # CLDR: symbols of three or more characters are separated from the number.
        assert _money(1234.56, "CHF") == "CHF 1,234.56"

    def test_en_zero(self):
        assert _money(0.0, "USD") == "$0.00"

    def test_en_negative_puts_the_sign_before_the_symbol(self):
        assert _money(-1234.56, "EUR") == "-€1,234.56"

    def test_unknown_currency_falls_back_to_its_code(self):
        assert _money(10.0, "XYZ") == "XYZ 10.00"

    def test_pt_br_uses_comma_decimals_and_a_space(self):
        assert _money(140.5, "BRL", "pt-BR") == "R$ 140,50"

    def test_pt_br_uses_its_own_us_dollar_symbol(self):
        # pt-BR prints "US$", en-US prints "$" — one shared table cannot serve both.
        assert _money(140.5, "USD", "pt-BR") == "US$ 140,50"
        assert _money(140.5, "USD") == "$140.50"

    def test_pt_br_thousands_separator(self):
        assert _money(1234.56, "BRL", "pt-BR") == "R$ 1.234,56"

    def test_returns_none_for_none_amount(self):
        assert _money(None, "EUR") is None


class TestToHome:
    """FX conversion must match the web app's `convertToHome()` exactly."""

    def test_same_currency_is_unchanged(self):
        assert _to_home(100, "EUR", "EUR", None) == 100

    def test_missing_currency_is_treated_as_home(self):
        assert _to_home(100, None, "EUR", None) == 100

    def test_foreign_amount_is_multiplied_by_the_rate(self):
        assert _to_home(100, "USD", "EUR", 0.9) == pytest.approx(90)

    def test_foreign_amount_without_a_rate_is_excluded(self):
        # Not 100, and not 0 — `None`, so the caller can count it as excluded.
        assert _to_home(100, "USD", "EUR", None) is None

    def test_none_amount_stays_none(self):
        assert _to_home(None, "USD", "EUR", 0.9) is None

    def test_missing_rate_flags_only_foreign_amounts(self):
        assert _missing_rate({"amountEstimate": 10, "currency": "USD"}, "EUR") is True
        assert _missing_rate({"amountEstimate": 10, "currency": "USD", "fxRate": 0.9}, "EUR") is False
        assert _missing_rate({"amountEstimate": 10, "currency": "EUR"}, "EUR") is False
        assert _missing_rate({"currency": "USD"}, "EUR") is False


class TestDateRange:
    def test_single_day_range(self):
        assert _date_range("2026-06-01", "2026-06-01") == ["2026-06-01"]

    def test_multi_day_range(self):
        result = _date_range("2026-06-01", "2026-06-03")
        assert result == ["2026-06-01", "2026-06-02", "2026-06-03"]

    def test_reversed_dates_return_empty(self):
        assert _date_range("2026-06-10", "2026-06-01") == []

    def test_none_start_returns_empty(self):
        assert _date_range(None, "2026-06-10") == []

    def test_invalid_date_string_returns_empty(self):
        assert _date_range("not-a-date", "2026-06-10") == []


def _trip(extra: dict | None = None) -> dict:
    base = {
        "_id": "trip:01",
        "type": "trip",
        "title": "Test Trip",
        "startDate": "2026-06-01",
        "endDate": "2026-06-03",
        "homeCurrency": "EUR",
        "destinations": [{"name": "Paris"}],
    }
    if extra:
        base.update(extra)
    return base


def _item(date: str | None, title: str, order: float = 0, deleted: bool = False, **kwargs) -> dict:
    d = {"_id": f"itin:01:{title}", "type": "itineraryItem", "date": date, "title": title, "order": order}
    if deleted:
        d["deletedAt"] = "2026-06-01T00:00:00+00:00"
    d.update(kwargs)
    return d


def _expense(category: str, estimate: float = 0, actual: float = 0, deleted: bool = False) -> dict:
    d = {
        "_id": f"exp:01:{category}",
        "type": "expense",
        "category": category,
        "amountEstimate": estimate,
        "amountActual": actual,
    }
    if deleted:
        d["deletedAt"] = "2026-06-01T00:00:00+00:00"
    return d


class TestShapeTripPdfContext:
    def test_empty_docs_does_not_crash(self):
        ctx = shape_trip_pdf_context([])
        assert "trip" in ctx
        assert ctx["trip"] == {}
        assert ctx["days"] == []

    def test_day_blocks_span_trip_dates(self):
        docs = [_trip(), _item("2026-06-01", "Breakfast"), _item("2026-06-02", "Lunch")]
        ctx = shape_trip_pdf_context(docs)
        dates = [b["date"] for b in ctx["days"]]
        assert "2026-06-01" in dates
        assert "2026-06-02" in dates
        assert "2026-06-03" in dates  # even if no items

    def test_soft_deleted_items_excluded(self):
        docs = [_trip(), _item("2026-06-01", "Visible"), _item("2026-06-01", "Deleted", deleted=True)]
        ctx = shape_trip_pdf_context(docs)
        day = next(b for b in ctx["days"] if b["date"] == "2026-06-01")
        titles = [i["title"] for i in day["items"]]
        assert "Visible" in titles
        assert "Deleted" not in titles

    def test_unscheduled_items_form_own_block(self):
        docs = [_trip(), _item(None, "Unscheduled")]
        ctx = shape_trip_pdf_context(docs)
        unscheduled = [b for b in ctx["days"] if b["date"] is None]
        assert len(unscheduled) == 1
        assert unscheduled[0]["label"] == "Unscheduled"

    def test_items_sorted_by_order_then_start_time(self):
        docs = [
            _trip(),
            {**_item("2026-06-01", "B"), "order": 2, "startTime": "10:00"},
            {**_item("2026-06-01", "A"), "order": 1, "startTime": "09:00"},
        ]
        ctx = shape_trip_pdf_context(docs)
        day = next(b for b in ctx["days"] if b["date"] == "2026-06-01")
        assert day["items"][0]["title"] == "A"
        assert day["items"][1]["title"] == "B"

    def test_cost_summary_aggregates_by_category(self):
        docs = [
            _trip(),
            _expense("food", estimate=100, actual=80),
            _expense("transport", estimate=200, actual=150),
        ]
        ctx = shape_trip_pdf_context(docs)
        costs = ctx["costs"]
        assert costs["hasData"] is True
        cats = {r["category"] for r in costs["rows"]}
        assert "food" in cats
        assert "transport" in cats

    def test_soft_deleted_expenses_excluded(self):
        docs = [_trip(), _expense("food", actual=100, deleted=True)]
        ctx = shape_trip_pdf_context(docs)
        assert ctx["costs"]["hasData"] is False

    def test_budget_remaining_computed(self):
        docs = [
            _trip({"budget": {"total": 500}}),
            _expense("food", actual=100),
        ]
        ctx = shape_trip_pdf_context(docs)
        assert ctx["costs"]["remaining"] is not None
        # 500 - 100 = 400
        assert "400.00" in ctx["costs"]["remaining"]

    def test_destinations_joined(self):
        docs = [_trip({"destinations": [{"name": "Paris"}, {"name": "Lyon"}]})]
        ctx = shape_trip_pdf_context(docs)
        assert "Paris" in ctx["destinations"]
        assert "Lyon" in ctx["destinations"]

    def test_checklist_grouped_by_group(self):
        docs = [
            _trip(),
            {"_id": "chk:01:A", "type": "checklistItem", "text": "Passport", "group": "Documents", "done": True, "order": 0},
            {"_id": "chk:01:B", "type": "checklistItem", "text": "Toothbrush", "group": "Packing", "done": False, "order": 0},
        ]
        ctx = shape_trip_pdf_context(docs)
        group_names = {g["name"] for g in ctx["checklist_groups"]}
        assert "Documents" in group_names
        assert "Packing" in group_names
        docs_group = next(g for g in ctx["checklist_groups"] if g["name"] == "Documents")
        assert docs_group["done"] == 1
        assert docs_group["total"] == 1

    def test_calendar_grid_shaping(self):
        docs = [
            _trip(),
            _item("2026-06-01", "Morning Coffee", startTime="08:30", endTime="09:30"),
            _item("2026-06-01", "Lunch", startTime="12:00", endTime="13:30"),
            _item("2026-06-01", "Hotel Check-in", startTime=None),  # All-day
        ]
        ctx = shape_trip_pdf_context(docs)
        assert "calendar_grid" in ctx
        grid = ctx["calendar_grid"]
        assert grid["has_data"] is True
        assert grid["start_hour"] <= 8
        assert grid["end_hour"] >= 14
        day1 = grid["days"][0]
        assert len(day1["timed"]) == 2
        assert len(day1["all_day"]) == 1
        assert day1["timed"][0]["title"] == "Morning Coffee"
        assert day1["all_day"][0]["title"] == "Hotel Check-in"

    def test_calendar_grid_rendered_in_html(self):
        docs = [
            _trip(),
            _item("2026-06-01", "Eiffel Tower Visit", startTime="10:00", endTime="12:00"),
        ]
        ctx = shape_trip_pdf_context(docs)
        html_page = render_trip_html(ctx)
        assert '<section class="cal-grid-section">' in html_page
        assert "Trip Overview" in html_page
        assert "Eiffel Tower Visit" in html_page

    def test_calendar_grid_chunking(self):
        # 9 day trip: 2026-06-01 to 2026-06-09
        docs = [
            _trip({"startDate": "2026-06-01", "endDate": "2026-06-09"}),
            _item("2026-06-01", "Activity 1", startTime="10:00", endTime="11:00"),
            _item("2026-06-08", "Activity 2", startTime="14:00", endTime="16:00"),
        ]
        ctx = shape_trip_pdf_context(docs)
        grid = ctx["calendar_grid"]
        assert len(grid["chunks"]) == 2
        assert len(grid["chunks"][0]["days"]) == 5
        assert len(grid["chunks"][1]["days"]) == 4
        assert grid["chunks"][0]["chunk_index"] == 1
        assert grid["chunks"][1]["chunk_index"] == 2
        html_page = render_trip_html(ctx)
        assert "Part 1 of 2" in html_page
        assert "Part 2 of 2" in html_page


def _dream_trip(extra: dict | None = None) -> dict:
    base = {
        "_id": "trip:01",
        "type": "trip",
        "title": "Someday Japan",
        "dateMode": "dream",
        "dreamDayCount": 3,
        "homeCurrency": "EUR",
    }
    if extra:
        base.update(extra)
    return base


def _ordinal_item(ordinal: int | None, title: str, **kwargs) -> dict:
    d = {"_id": f"itin:01:{title}", "type": "itineraryItem", "title": title, "order": 0}
    if ordinal is not None:
        d["dayOrdinal"] = ordinal
    d.update(kwargs)
    return d


class TestDreamShapeTripPdfContext:
    def test_numbered_days_use_ordinals_not_dates(self):
        docs = [
            _dream_trip(),
            _ordinal_item(1, "Arrive"),
            _ordinal_item(3, "Market"),
        ]
        ctx = shape_trip_pdf_context(docs)
        labels = [b["label"] for b in ctx["days"]]
        assert labels == ["Day 1", "Day 2", "Day 3"]
        assert ctx["days"][0]["items"][0]["title"] == "Arrive"
        assert ctx["days"][1]["items"] == []
        assert ctx["days"][2]["items"][0]["title"] == "Market"
        assert all(b["date"] is None for b in ctx["days"])

    def test_trip_day_title_is_appended_to_the_label(self):
        docs = [
            _dream_trip(),
            {
                "_id": "day:trip01:dream-002",
                "type": "tripDay",
                "ordinal": 2,
                "title": "Onsen",
            },
            _ordinal_item(2, "Bath"),
        ]
        ctx = shape_trip_pdf_context(docs)
        day_two = next(b for b in ctx["days"] if b.get("ordinal") == 2)
        assert day_two["label"] == "Day 2 — Onsen"
        assert day_two["items"][0]["title"] == "Bath"

    def test_items_without_an_ordinal_are_unscheduled_even_with_a_stale_date(self):
        docs = [
            _dream_trip(),
            _ordinal_item(1, "Planned"),
            _item("2026-06-05", "Stale date"),
        ]
        ctx = shape_trip_pdf_context(docs)
        blocks = [b for b in ctx["days"] if b.get("date") is None]
        unscheduled = [b for b in blocks if b.get("ordinal") is None]
        assert len(unscheduled) == 1
        assert unscheduled[0]["label"] == "Unscheduled"
        assert [i["title"] for i in unscheduled[0]["items"]] == ["Stale date"]
        # A stale date must not manufacture a dated block on a dream plan.
        assert not any(b.get("date") for b in ctx["days"])

    def test_legacy_undated_trip_with_ordinals_is_grouped_as_a_dream_plan(self):
        trip = {
            "_id": "trip:01",
            "type": "trip",
            "title": "Someday",
            "homeCurrency": "EUR",
        }
        ctx = shape_trip_pdf_context([trip, _ordinal_item(2, "Second day")])
        assert [b["label"] for b in ctx["days"]] == ["Day 1", "Day 2"]
        assert ctx["days"][1]["items"][0]["title"] == "Second day"

    def test_cover_says_flexible_dates(self):
        docs = [_dream_trip({"dreamDayCount": 2})]
        ctx = shape_trip_pdf_context(docs)
        assert ctx["cover"]["dateRange"] == "Flexible dates"
        assert ctx["cover"]["dateRangeISO"] == ""

    def test_cover_and_days_are_localised(self):
        docs = [_dream_trip({"dreamDayCount": 2}), _ordinal_item(1, "Chegada")]
        ctx = shape_trip_pdf_context(docs, lang="pt-BR")
        assert ctx["cover"]["dateRange"] == "Datas flexíveis"
        assert ctx["days"][0]["label"] == "Dia 1"

    def test_rendered_html_prints_numbered_days(self):
        docs = [_dream_trip({"dreamDayCount": 2}), _ordinal_item(2, "Market")]
        html_page = render_trip_html(shape_trip_pdf_context(docs))
        assert "Flexible dates" in html_page
        assert "Day 2" in html_page
        assert "Market" in html_page


class TestLocalisedLabels:
    """
    Every closed-set value the document prints (a category, a reservation kind)
    has to read the way the screen reads it: the server PDF used to print the
    stored value, so a pt-BR document said "food" beside otherwise Portuguese
    text.
    """

    def test_expense_category_is_translated(self):
        ctx = shape_trip_pdf_context([_trip(), _expense("food", actual=10)], lang="pt-BR")
        row = next(r for r in ctx["costs"]["rows"] if r["category"] == "food")
        assert row["label"] == "Alimentação"

    def test_expense_category_defaults_to_english(self):
        ctx = shape_trip_pdf_context([_trip(), _expense("shopping", actual=10)])
        row = next(r for r in ctx["costs"]["rows"] if r["category"] == "shopping")
        assert row["label"] == "Shopping"

    def test_itinerary_chip_uses_the_label(self):
        docs = [_trip(), _item("2026-06-01", "Jantar", category="food")]
        ctx = shape_trip_pdf_context(docs, lang="pt-BR")
        day = next(b for b in ctx["days"] if b["date"] == "2026-06-01")
        assert day["items"][0]["category_label"] == "Alimentação"

    def test_itinerary_only_category_is_labelled(self):
        # `sightseeing` is an itinerary category no expense shares, and the
        # shared dictionary has no `cat_*` key for it.
        docs = [_trip(), _item("2026-06-01", "Museu", category="sightseeing")]
        ctx = shape_trip_pdf_context(docs, lang="pt-BR")
        day = next(b for b in ctx["days"] if b["date"] == "2026-06-01")
        assert day["items"][0]["category_label"] == "Passeios"

    def test_uncategorised_item_gets_no_chip(self):
        docs = [_trip(), _item("2026-06-01", "Siesta")]
        ctx = shape_trip_pdf_context(docs, lang="pt-BR")
        day = next(b for b in ctx["days"] if b["date"] == "2026-06-01")
        assert "category_label" not in day["items"][0]

    def test_unknown_category_prints_as_itself(self):
        # A category from a newer client must not come out blank, or as the
        # name of a key that does not exist.
        ctx = shape_trip_pdf_context([_trip(), _expense("misc", actual=10)], lang="pt-BR")
        row = next(r for r in ctx["costs"]["rows"] if r["category"] == "misc")
        assert row["label"] == "misc"

    def test_expense_without_a_category_reads_as_other(self):
        docs = [_trip(), {"_id": "exp:01", "type": "expense", "amountActual": 10}]
        ctx = shape_trip_pdf_context(docs, lang="pt-BR")
        assert [r["label"] for r in ctx["costs"]["rows"]] == ["Outros"]

    def test_reservation_kind_is_translated(self):
        docs = [_trip(), {"_id": "res:01", "type": "reservation", "name": "Café", "kind": "restaurant"}]
        ctx = shape_trip_pdf_context(docs, lang="pt-BR")
        assert ctx["reservations"][0]["kind_label"] == "Restaurante"

    def test_ungrouped_checklist_item_reads_as_other(self):
        docs = [_trip(), {"_id": "chk:01", "type": "checklistItem", "text": "Passport"}]
        ctx = shape_trip_pdf_context(docs, lang="pt-BR")
        assert [g["name"] for g in ctx["checklist_groups"]] == ["Outros"]

    def test_named_checklist_group_is_left_as_written(self):
        docs = [
            _trip(),
            {"_id": "chk:01", "type": "checklistItem", "text": "Passport", "group": "Packing"},
        ]
        ctx = shape_trip_pdf_context(docs, lang="pt-BR")
        assert [g["name"] for g in ctx["checklist_groups"]] == ["Packing"]

    def test_rendered_html_prints_labels_not_stored_values(self):
        docs = [
            _trip(),
            _item("2026-06-01", "Jantar", category="food"),
            _expense("food", actual=10),
        ]
        html_page = render_trip_html(shape_trip_pdf_context(docs, lang="pt-BR"))
        assert "Alimentação" in html_page
        assert 'class="cat">food<' not in html_page
        assert "<td>food</td>" not in html_page


class TestDocumentLanguage:
    """`?lang=` has to reach the document itself, metadata included."""

    def test_html_declares_the_requested_language(self):
        html_page = render_trip_html(shape_trip_pdf_context([_trip()], lang="pt-BR"))
        assert '<html lang="pt-BR">' in html_page

    def test_html_defaults_to_english(self):
        html_page = render_trip_html(shape_trip_pdf_context([_trip()]))
        assert '<html lang="en">' in html_page

    def test_document_title_uses_the_localised_placeholder(self):
        html_page = render_trip_html(shape_trip_pdf_context([_trip({"title": None})], lang="pt-BR"))
        assert "<title>Viagem sem título" in html_page


class TestPaperSize:
    """`?paper=` chooses the CSS page size; anything unknown is A4, not a 422."""

    def test_default_is_a4(self):
        html_page = render_trip_html(shape_trip_pdf_context([_trip()]))
        assert "size: A4;" in html_page

    def test_letter_is_threaded_into_the_page_rule(self):
        html_page = render_trip_html(shape_trip_pdf_context([_trip()]), paper="letter")
        assert "size: letter;" in html_page

    def test_paper_value_is_case_and_space_insensitive(self):
        html_page = render_trip_html(shape_trip_pdf_context([_trip()]), paper="  LETTER ")
        assert "size: letter;" in html_page

    def test_unknown_paper_falls_back_to_a4(self):
        html_page = render_trip_html(shape_trip_pdf_context([_trip()]), paper="A3")
        assert "size: A4;" in html_page
        assert "size: A3" not in html_page


class TestCoverSheet:
    """Page one has to answer what the document is before the reader turns it."""

    def test_cover_names_the_trip_dates_destinations_and_party(self):
        docs = [
            _trip(
                {
                    "title": "Paris in June",
                    "travelerCount": 3,
                    "destinations": [{"name": "Paris"}, {"name": "Lyon"}],
                }
            )
        ]
        ctx = shape_trip_pdf_context(docs)
        cover = ctx["cover"]
        assert cover["title"] == "Paris in June"
        assert cover["destinations"] == "Paris → Lyon"
        assert "Jun 01" in cover["dateRange"]
        assert "Jun 03" in cover["dateRange"]
        assert cover["travelerCount"] == 3

        html_page = render_trip_html(ctx)
        assert "<h1>Paris in June</h1>" in html_page
        assert "Paris → Lyon" in html_page
        assert "Travelers: 3" in html_page
        assert 'datetime="2026-06-01/2026-06-03"' in html_page
        assert "<h2>Contents</h2>" in html_page

    def test_cover_uses_the_untitled_fallback_and_no_contents_when_empty(self):
        ctx = shape_trip_pdf_context([])
        assert ctx["cover"]["title"] == "Untitled trip"
        assert ctx["cover"]["sections"] == []
        html_page = render_trip_html(ctx)
        assert "<h1>Untitled trip</h1>" in html_page
        assert 'class="contents"' not in html_page

    def test_contents_lists_only_sections_with_content(self):
        # A dated trip renders the overview grid and the day blocks; there is
        # nothing in the other four sections to send the reader to.
        ctx = shape_trip_pdf_context([_trip(), _item("2026-06-01", "Breakfast")])
        labels = [entry["label"] for entry in ctx["cover"]["sections"]]
        assert labels == ["Trip Overview", "Itinerary"]
        assert "Flights" not in labels

    def test_contents_lists_every_present_section_in_document_order(self):
        docs = [
            _trip({"travelerCount": 2}),
            _item("2026-06-01", "Breakfast", startTime="09:00", category="food"),
            {"_id": "fl:01", "type": "flight", "segments": []},
            {"_id": "res:01", "type": "reservation", "name": "Hotel", "kind": "lodging"},
            {"_id": "chk:01", "type": "checklistItem", "text": "Passport"},
            _expense("food", actual=10),
        ]
        ctx = shape_trip_pdf_context(docs)
        assert [entry["label"] for entry in ctx["cover"]["sections"]] == [
            "Trip Overview",
            "Itinerary",
            "Flights",
            "Reservations",
            "Checklist",
            "Costs & Budget",
        ]
        html_page = render_trip_html(ctx)
        assert 'class="contents"' in html_page
        assert "<h2>Contents</h2>" in html_page

    def test_cover_follows_the_requested_language(self):
        docs = [_trip({"travelerCount": 2}), _item("2026-06-01", "Café")]
        ctx = shape_trip_pdf_context(docs, lang="pt-BR")
        cover = ctx["cover"]
        assert cover["contentsLabel"] == "Índice"
        assert cover["travelersLabel"] == "Viajantes"
        assert [entry["label"] for entry in cover["sections"]] == [
            "Visão Geral da Viagem",
            "Roteiro",
        ]
        assert "01 de Jun" in cover["dateRange"]

        html_page = render_trip_html(ctx)
        assert "<h2>Índice</h2>" in html_page
        assert "Viajantes: 2" in html_page

    def test_cover_never_prints_an_english_heading_in_portuguese(self):
        html_page = render_trip_html(
            shape_trip_pdf_context([_trip(), _expense("food", actual=10)], lang="pt-BR")
        )
        assert "Contents" not in html_page
        assert "Travelers" not in html_page
        assert "Índice" in html_page
        assert "Viajantes" in html_page


def _body_text(page) -> str:
    """A page's content text, ignoring the margin-box footer."""
    parts: list[str] = []

    def walk(box) -> None:
        text = getattr(box, "text", None)
        if text:
            parts.append(text)
        for child in getattr(box, "children", ()):
            walk(child)

    walk(page._page_box.children[0])
    return " ".join(parts)


class TestCoverPagination:
    def test_the_cover_is_page_one_and_the_page_after_it_is_not_blank(self):
        weasyprint = pytest.importorskip("weasyprint")
        docs = [_trip(), _item("2026-06-01", "Breakfast", startTime="09:00")]
        document = weasyprint.HTML(
            string=render_trip_html(shape_trip_pdf_context(docs))
        ).render()

        assert len(document.pages) >= 2
        cover = _body_text(document.pages[0])
        assert "Test Trip" in cover
        assert "Contents" in cover
        assert "Breakfast" not in cover

        for page in document.pages[1:]:
            assert _body_text(page).strip(), "a page after the cover is blank"
        assert "Breakfast" in _body_text(document.pages[1])


class TestRenderMarkdown:
    def test_renders_lists(self):
        text = "- Natal Luz, 41ª edição\n- Acendimento das Luzes"
        html_out = render_markdown(text)
        assert '<ul class="note-list">' in html_out
        assert "<li>Natal Luz, 41ª edição</li>" in html_out
        assert "<li>Acendimento das Luzes</li>" in html_out

    def test_renders_headings_and_bold(self):
        text = "# Gramado Tips\nDon't forget your **coat** and *gloves*."
        html_out = render_markdown(text)
        assert '<div class="note-h1">Gramado Tips</div>' in html_out
        assert "<strong>coat</strong>" in html_out
        assert "<em>gloves</em>" in html_out

    def test_render_trip_html_with_markdown(self):
        ctx = shape_trip_pdf_context([_trip({"notes": "# Important Notes\n- Pack boots\n- Book tickets"})])
        html_page = render_trip_html(ctx)
        assert '<section class="trip-notes">' in html_page
        assert '<div class="note-h1">Important Notes</div>' in html_page
        assert "<li>Pack boots</li>" in html_page
