"""
Money maths for the server-rendered PDF — a deliberate mirror of the web app.

The phone and the printed sheet are both called "the trip". When they disagree
about the total, the reader stops trusting both numbers. So this module does not
invent its own rules: it reproduces, expression for expression,
`web/src/lib/db/money.ts`, which is itself unit-tested against the same cases
(`api/tests/test_money.py` mirrors `web/src/lib/db/money.test.ts`).

The four rules that matter:

1. Every expense stores its own `currency` plus a **manually entered `fxRate`**
   snapshot to the trip's `homeCurrency`.
2. A foreign amount with **no** rate is *excluded* from every total and counted —
   never summed as though the currencies were interchangeable.
3. `costType == "per_person"` multiplies the amount by the trip's
   `travelerCount`. The app shows group totals; the per-person figure is a
   *display* division, not the stored number.
4. `spent` is `actual ?? estimate`, so an expense with only an estimate still
   counts against the budget.

Kept dependency-free and free of I/O so it is cheap to unit-test.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any


def _as_float(value: Any) -> float | None:
    """Coerce a stored amount to a float, or `None` when it is not a number.

    CouchDB hands back whatever was written, and an older import may have stored
    `"120,50"` or `""`. The web app's `convertToHome` takes `number | null`, so
    its equivalent of this tolerance is the zod schema at the write boundary;
    here the tolerance lives at the read, because the PDF reads documents that
    may predate the schema.
    """
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _same_currency(currency: Any, home_currency: str) -> bool:
    """True when no conversion is needed.

    Case-insensitive on purpose: `money.ts` compares with `===`, and the currency
    pickers store upper-case ISO codes, so the two agree on every document the
    app itself writes. The tolerance only ever helps a hand-edited document, and
    it can never turn a *real* conversion into a skipped one — `usd` and `USD`
    are the same money.
    """
    if not currency:
        return True
    return str(currency).strip().upper() == home_currency.strip().upper()


def convert_to_home(
    amount: Any,
    currency: Any,
    home_currency: str,
    fx_rate: Any = None,
) -> float | None:
    """Convert `amount` in `currency` to `home_currency`.

    - same currency (or no currency recorded) → the amount unchanged;
    - foreign with an `fxRate` → `amount x rate`;
    - foreign with **no** rate → `None` (excluded, and counted as missing).
    """
    value = _as_float(amount)
    if value is None:
        return None
    if _same_currency(currency, home_currency):
        return value
    rate = _as_float(fx_rate)
    if rate is None:
        return None
    return value * rate


@dataclass(frozen=True)
class ExpenseAmounts:
    """One expense's home-currency figures, mirroring `ExpenseAmounts` in TS."""

    estimate: float | None
    actual: float | None
    spent: float | None
    missing_rate: bool


def expense_amounts(
    exp: Mapping[str, Any], home_currency: str
) -> ExpenseAmounts:
    """Resolve one expense's home-currency figures."""
    estimate = convert_to_home(
        exp.get("amountEstimate"), exp.get("currency"), home_currency, exp.get("fxRate")
    )
    actual = convert_to_home(
        exp.get("amountActual"), exp.get("currency"), home_currency, exp.get("fxRate")
    )
    spent = actual if actual is not None else estimate
    has_amount = exp.get("amountEstimate") is not None or exp.get("amountActual") is not None
    missing_rate = (
        not _same_currency(exp.get("currency"), home_currency)
        and _as_float(exp.get("fxRate")) is None
        and has_amount
    )
    return ExpenseAmounts(
        estimate=estimate, actual=actual, spent=spent, missing_rate=missing_rate
    )


@dataclass
class MoneyTotals:
    """Aggregated money figures, always in the home currency.

    Mirrors `MoneyTotals` in `web/src/lib/db/money.ts`. Mutable because the
    roll-up functions fold a list into it; the field names are snake_case to
    match Python, with the mapping documented per field.
    """

    estimate: float = 0.0  # Σ estimate
    actual: float = 0.0  # Σ actual
    spent: float = 0.0  # Σ (actual ?? estimate)
    unpaid: float = 0.0  # Σ spent where `paid` is falsy
    missing_rate_count: int = 0  # amounts excluded for a missing rate

    def add(self, exp: Mapping[str, Any], home_currency: str, traveler_count: int = 1) -> None:
        """Fold one expense in, applying the per-person multiplier.

        `traveler_count` is only applied to `costType == "per_person"`. A trip
        estimate entered as "120 per person" for four travellers really is 480,
        and the app has always said so; the PDF used to print the group total
        without it.
        """
        amounts = expense_amounts(exp, home_currency)
        factor = traveler_count if exp.get("costType") == "per_person" else 1
        if amounts.estimate is not None:
            self.estimate += amounts.estimate * factor
        if amounts.actual is not None:
            self.actual += amounts.actual * factor
        if amounts.spent is not None:
            self.spent += amounts.spent * factor
            if not exp.get("paid"):
                self.unpaid += amounts.spent * factor
        if amounts.missing_rate:
            self.missing_rate_count += 1

    def as_dict(self) -> dict[str, float | int]:
        """The camelCase shape the template and the web both speak."""
        return {
            "estimate": self.estimate,
            "actual": self.actual,
            "spent": self.spent,
            "unpaid": self.unpaid,
            "missingRateCount": self.missing_rate_count,
        }


def sum_expenses(
    expenses: Iterable[Mapping[str, Any]],
    home_currency: str,
    traveler_count: int = 1,
) -> MoneyTotals:
    """Sum a list of expenses into home-currency totals."""
    totals = MoneyTotals()
    for exp in expenses:
        totals.add(exp, home_currency, traveler_count)
    return totals


@dataclass(frozen=True)
class DayRollup:
    """One day's roll-up (or the undated bucket when `date` is `None`)."""

    date: str | None
    totals: MoneyTotals


@dataclass(frozen=True)
class ByDayRollup:
    """Per-day roll-up plus a dedicated undated ("whole-trip costs") bucket."""

    days: list[DayRollup] = field(default_factory=list)
    undated: MoneyTotals = field(default_factory=MoneyTotals)


def rollup_by_day(
    expenses: Iterable[Mapping[str, Any]],
    home_currency: str,
    traveler_count: int = 1,
) -> ByDayRollup:
    """Roll expenses up by day. Undated expenses collect in their own bucket.

    Days are returned ascending by ISO date, which is the order the itinerary
    already uses — string comparison is correct for `YYYY-MM-DD`.
    """
    by_date: dict[str, MoneyTotals] = {}
    undated = MoneyTotals()
    for exp in expenses:
        date = exp.get("date")
        if date:
            totals = by_date.setdefault(str(date), MoneyTotals())
            totals.add(exp, home_currency, traveler_count)
        else:
            undated.add(exp, home_currency, traveler_count)
    days = [DayRollup(date=date, totals=by_date[date]) for date in sorted(by_date)]
    return ByDayRollup(days=days, undated=undated)


def rollup_by_category(
    expenses: Iterable[Mapping[str, Any]],
    home_currency: str,
    traveler_count: int = 1,
) -> dict[str, MoneyTotals]:
    """Roll expenses up by category (home currency)."""
    out: dict[str, MoneyTotals] = {}
    for exp in expenses:
        category = exp.get("category") or "other"
        out.setdefault(str(category), MoneyTotals()).add(
            exp, home_currency, traveler_count
        )
    return out


def budget_remaining(spent: float, total: Any) -> float | None:
    """Remaining budget = `total - spent` (negative when over budget)."""
    budget = _as_float(total)
    if budget is None:
        return None
    return budget - spent


def budget_used_fraction(spent: float, total: Any) -> float | None:
    """Fraction of the budget used (`spent / total`), `None` when unset or zero."""
    budget = _as_float(total)
    if budget is None or budget == 0:
        return None
    return spent / budget


def round_money(value: float) -> float:
    """Round to 2 decimals, mirroring `roundMoney()`.

    `+ EPSILON` before rounding is the same trick the TS uses so that
    `1.005` rounds to `1.01` rather than down to `1.00` on a binary float.
    """
    return round(value + 2.220446049250313e-16, 2)
