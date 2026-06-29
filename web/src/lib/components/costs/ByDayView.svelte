<script lang="ts">
    import type { expenses, MoneyTotals } from '$lib/db';
    import { formatMoney, formatWeekdayDate } from '$lib/format';
    import { Badge } from '$lib/components/ui';
    import CostBar from './CostBar.svelte';

    interface Props {
        byDay: expenses.ByDayBudget;
        /** Grand totals (repo summary) – never recomputed here. */
        summary: expenses.BudgetSummary;
        /** When on, feature the unpaid figure and hide budget bars. */
        unpaidOnly?: boolean;
    }

    let { byDay, summary, unpaidOnly = false }: Props = $props();

    const home = $derived(byDay.homeCurrency);
    const target = $derived(byDay.perDayTarget);
    const money = (n: number) => formatMoney(n, home);
    const hasContent = (t: MoneyTotals) => t.estimate > 0 || t.actual > 0 || t.spent > 0;

    const visibleDays = $derived(
        byDay.days.filter((d) => (unpaidOnly ? d.totals.unpaid > 0 : hasContent(d.totals)))
    );
    const showUndated = $derived(
        unpaidOnly ? byDay.undated.unpaid > 0 : hasContent(byDay.undated)
    );

    // Shared scale so every bar is comparable (presentation only – not a total).
    const scale = $derived(
        Math.max(
            1,
            target ?? 0,
            byDay.undated.spent,
            ...byDay.days.map((d) => d.totals.spent)
        )
    );

    const grandPrimary = $derived(unpaidOnly ? summary.unpaid : summary.actual);
</script>

{#if visibleDays.length === 0 && !showUndated}
    <p class="rounded-lg border border-dashed border-border bg-surface-sunken px-4 py-8 text-center text-sm text-ink-muted">
        {unpaidOnly ? 'Nothing outstanding – every dated cost is paid.' : 'No dated costs yet.'}
    </p>
{:else}
    <ul class="space-y-2.5">
        {#each visibleDays as day (day.date)}
            {@const t = day.totals}
            <li class="rounded-lg border border-border bg-surface p-3.5 shadow-soft">
                <div class="flex items-baseline justify-between gap-3">
                    <h3 class="font-medium">{formatWeekdayDate(day.date)}</h3>
                    <span class="text-base font-semibold tabular-nums">
                        {money(unpaidOnly ? t.unpaid : t.spent)}
                    </span>
                </div>
                {#if unpaidOnly}
                    <p class="mt-1 text-xs text-ink-muted">Outstanding (unpaid)</p>
                {:else}
                    <div class="mt-2">
                        <CostBar
                            value={t.spent}
                            {target}
                            max={scale}
                            tone={day.overBudget ? 'warning' : 'primary'}
                        />
                    </div>
                    <div class="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-ink-muted">
                        <span class="tabular-nums">
                            Est. {money(t.estimate)} • Actual {money(t.actual)}
                        </span>
                        {#if day.overBudget && target != null}
                            <Badge variant="warning">Over budget • {money(t.spent - target)}</Badge>
                        {:else if target != null}
                            <span class="tabular-nums">Target {money(target)}</span>
                        {/if}
                    </div>
                {/if}

                <span class="sr-only">
                    {formatWeekdayDate(day.date)}: {money(t.spent)} spent{target != null
                        ? ` of ${money(target)} target`
                        : ''}{day.overBudget ? `, over budget ` : ''}.
                    {#if t.unpaid > 0}{money(t.unpaid)} unpaid.{/if}
                </span>
            </li>
        {/each}

        {#if showUndated}
            <li class="rounded-lg border border-border bg-surface-sunken/70 p-3.5">
                <div class="flex items-baseline justify-between gap-3">
                    <h3 class="font-medium">Whole-trip costs</h3>
                    <span class="text-base font-semibold tabular-nums">
                        {money(unpaidOnly ? byDay.undated.unpaid : byDay.undated.spent)}
                    </span>
                </div>
                <p class="mt-1 text-xs text-ink-muted">
                    {#if unpaidOnly}
                        Outstanding (unpaid)
                    {:else}
                        Undated – flights, insurance and other trip-wide spend.
                        <span class="tabular-nums">
                            Est. {money(byDay.undated.estimate)} • Actual {money(byDay.undated.actual)}
                        </span>
                    {/if}
                </p>
            </li>
        {/if}
    </ul>

    <div class="mt-4 flex items-center justify-between rounded-lg bg-primary-100 px-4 py-3">
        <span class="font-medium text-primary-700">Total</span>
        {#if unpaidOnly}
            <span class="font-semibold tabular-nums text-primary-700">
                {money(summary.unpaid)} unpaid
            </span>
        {:else}
            <span class="text-sm font-medium tabular-nums text-primary-700">
                Estimated <span class="text-base font-semibold">{money(summary.estimate)}</span>
                <span aria-hidden="true" class="mx-1 opacity-50">/</span>
                Actual <span class="text-base font-semibold">{money(grandPrimary)}</span>
            </span>
        {/if}
    </div>
{/if}