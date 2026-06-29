/**
 * Pure money maths – multi-currency conversion and budget roll-ups.
 *
 * Each expense stores its own `currency` plus a **manually entered `fxRate`**
 * snapshot to the trip's `homeCurrency` (see `docs/12-page-costs-budget.md`).
 * Using the snapshot keeps historical totals stable when rates later change.
 * No network, no rates API – consistent with the offline-first goal.
 *
 * These helpers take plain structural inputs (not the full document types) so
 * they stay decoupled and unit-testable without importing PouchDB.
 */

/** Minimal expense shape needed for money maths (structurally compatible with `Expense`). */
export interface ExpenseLike {
  amountEstimate?: number | null;
  amountActual?: number | null;
  currency?: string | null;
  fxRate?: number | null;
  paid?: boolean;
  date?: string | null;
  category?: string | null;
}

/** Aggregated money figures, always expressed in the home currency. */
export interface MoneyTotals {
  /** Σ estimate (home currency). */
  estimate: number;
  /** Σ actual (home currency). */
  actual: number;
  /** Σ spent = actual ?? estimate (home currency). */
  spent: number;
  /** Σ spent for unpaid items (home currency). */
  unpaid: number;
  /** How many contributing amounts were excluded for a missing FX rate. */
  missingRateCount: number;
}

/**
 * Convert an amount in `currency` to `homeCurrency`.
 * - same currency → the amount unchanged
 * - foreign + rate → amount × fxRate
 * - foreign + **no rate** → `null` (excluded from totals, surfaced as a prompt)
 */
export function convertToHome(
  amount: number | null | undefined,
  currency: string | null | undefined,
  homeCurrency: string,
  fxRate?: number | null
): number | null {
  if (amount == null) return null;
  if (!currency || currency === homeCurrency) return amount;
  if (fxRate == null) return null;
  return amount * fxRate;
}

/** The home-currency estimate/actual/spent for one expense, flagging a missing rate. */
export interface ExpenseAmounts {
  estimate: number | null;
  actual: number | null;
  /** actual ?? estimate */
  spent: number | null;
  /** True when a foreign amount exists but no `fxRate` was provided. */
  missingRate: boolean;
}

/** Resolve one expense's home-currency figures. */
export function expenseAmounts(exp: ExpenseLike, homeCurrency: string): ExpenseAmounts {
  const estimate = convertToHome(exp.amountEstimate, exp.currency, homeCurrency, exp.fxRate);
  const actual = convertToHome(exp.amountActual, exp.currency, homeCurrency, exp.fxRate);
  const spent = actual ?? estimate;
  const foreign = !!exp.currency && exp.currency !== homeCurrency;
  const hasAmount = exp.amountEstimate != null || exp.amountActual != null;
  const missingRate = foreign && exp.fxRate == null && hasAmount;
  return { estimate, actual, spent, missingRate };
}

function emptyTotals(): MoneyTotals {
  return { estimate: 0, actual: 0, spent: 0, unpaid: 0, missingRateCount: 0 };
}

function addExpense(totals: MoneyTotals, exp: ExpenseLike, homeCurrency: string): void {
  const { estimate, actual, spent, missingRate } = expenseAmounts(exp, homeCurrency);
  if (estimate != null) totals.estimate += estimate;
  if (actual != null) totals.actual += actual;
  if (spent != null) {
    totals.spent += spent;
    if (!exp.paid) totals.unpaid += spent;
  }
  if (missingRate) totals.missingRateCount += 1;
}

/** Sum a list of expenses into home-currency totals. */
export function sumExpenses(expenses: ExpenseLike[], homeCurrency: string): MoneyTotals {
  const totals = emptyTotals();
  for (const exp of expenses) addExpense(totals, exp, homeCurrency);
  return totals;
}

/** One day's roll-up (or the undated/"whole-trip" bucket when `date` is `null`). */
export interface DayRollup {
  date: string | null;
  totals: MoneyTotals;
}

/** Per-day roll-up plus a dedicated undated ("whole-trip costs") bucket. */
export interface ByDayRollup {
  /** Dated buckets, ascending by date. */
  days: DayRollup[];
  /** Costs with no date (flights, insurance, ...). */
  undated: MoneyTotals;
}

/** Roll expenses up by day. Undated expenses collect in their own bucket. */
export function rollupByDay(expenses: ExpenseLike[], homeCurrency: string): ByDayRollup {
  const byDate = new Map<string, MoneyTotals>();
  const undated = emptyTotals();
  for (const exp of expenses) {
    if (exp.date) {
      let t = byDate.get(exp.date);
      if (!t) byDate.set(exp.date, (t = emptyTotals()));
      addExpense(t, exp, homeCurrency);
    } else {
      addExpense(undated, exp, homeCurrency);
    }
  }
  const days = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, totals]) => ({ date, totals }));
  return { days, undated };
}

/** Roll expenses up by category (home currency). */
export function rollupByCategory(
  expenses: ExpenseLike[],
  homeCurrency: string
): Record<string, MoneyTotals> {
  const out: Record<string, MoneyTotals> = {};
  for (const exp of expenses) {
    const cat = exp.category ?? 'other';
    const t = out[cat] ??= emptyTotals();
    addExpense(t, exp, homeCurrency);
  }
  return out;
}

/** Remaining budget = `total - spent` (may be negative when over budget). */
export function budgetRemaining(spent: number, total: number | null | undefined): number | null {
  if (total == null) return null;
  return total - spent;
}

/** Fraction of a budget used (`spent / total`), `null` when no budget is set. */
export function budgetUsedFraction(spent: number, total: number | null | undefined): number | null {
  if (total == null || total === 0) return null;
  return spent / total;
}

/** Round to 2 decimals for stable display/equality of money values. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
