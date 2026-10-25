<script lang="ts">
	import type { expenses, MoneyTotals } from '$lib/db';
	import { formatMoney, formatWeekdayDate } from '$lib/format';
	import { Badge } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
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
	const showUndated = $derived(unpaidOnly ? byDay.undated.unpaid > 0 : hasContent(byDay.undated));

	// Shared scale so every bar is comparable (presentation only – not a total).
	const scale = $derived(
		Math.max(1, target ?? 0, byDay.undated.spent, ...byDay.days.map((d) => d.totals.spent))
	);

	const grandPrimary = $derived(unpaidOnly ? summary.unpaid : summary.actual);
</script>

{#if visibleDays.length === 0 && !showUndated}
	<p
		class="rounded-lg border border-dashed border-border bg-surface-sunken px-4 py-8 text-center text-sm text-ink-muted"
	>
		{unpaidOnly ? t('costs_nothing_outstanding_dated') : t('costs_no_dated_costs')}
	</p>
{:else}
	<ul class="space-y-2.5">
		{#each visibleDays as day (day.date)}
			{@const totals = day.totals}
			<li class="rounded-lg border border-border bg-surface p-3.5 shadow-soft">
				<div class="flex items-baseline justify-between gap-3">
					<h3 class="font-medium">{formatWeekdayDate(day.date)}</h3>
					<span class="text-base font-semibold tabular-nums">
						{money(unpaidOnly ? totals.unpaid : totals.spent)}
					</span>
				</div>
				{#if unpaidOnly}
					<p class="mt-1 text-xs text-ink-muted">{t('costs_outstanding')}</p>
				{:else}
					<div class="mt-2">
						<CostBar
							value={totals.spent}
							{target}
							max={scale}
							tone={day.overBudget ? 'warning' : 'primary'}
						/>
					</div>
					<div
						class="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-ink-muted"
					>
						<span class="tabular-nums">
							{t('costs_est_actual', {
								estimate: money(totals.estimate),
								actual: money(totals.actual)
							})}
						</span>
						{#if day.overBudget && target != null}
							<Badge variant="warning">
								{t('costs_over_budget_amount', { amount: money(totals.spent - target) })}
							</Badge>
						{:else if target != null}
							<span class="tabular-nums">{t('costs_target', { amount: money(target) })}</span>
						{/if}
					</div>
				{/if}

				<span class="sr-only">
					{t('costs_sr_day_spent', {
						date: formatWeekdayDate(day.date),
						amount: money(totals.spent)
					})}{target != null
						? t('costs_sr_of_day_target', { amount: money(target) })
						: ''}{day.overBudget ? t('costs_sr_over_budget') : ''}.
					{#if totals.unpaid > 0}{t('costs_sr_unpaid', {
							amount: money(totals.unpaid)
						})}{/if}
				</span>
			</li>
		{/each}

		{#if showUndated}
			<li class="rounded-lg border border-border bg-surface-sunken/70 p-3.5">
				<div class="flex items-baseline justify-between gap-3">
					<h3 class="font-medium">{t('costs_whole_trip')}</h3>
					<span class="text-base font-semibold tabular-nums">
						{money(unpaidOnly ? byDay.undated.unpaid : byDay.undated.spent)}
					</span>
				</div>
				<p class="mt-1 text-xs text-ink-muted">
					{#if unpaidOnly}
						{t('costs_outstanding')}
					{:else}
						{t('costs_undated_hint')}
						<span class="tabular-nums">
							{t('costs_est_actual', {
								estimate: money(byDay.undated.estimate),
								actual: money(byDay.undated.actual)
							})}
						</span>
					{/if}
				</p>
			</li>
		{/if}
	</ul>

	<div
		class="mt-4 flex flex-col gap-1 rounded-lg bg-primary-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
	>
		<span class="font-medium text-primary-700">{t('costs_total')}</span>
		{#if unpaidOnly}
			<span class="font-semibold tabular-nums text-primary-700">
				{t('costs_unpaid_summary', { amount: money(summary.unpaid) })}
			</span>
		{:else}
			<span class="text-sm font-medium tabular-nums text-primary-700">
				{t('estimated')} <span class="text-base font-semibold">{money(summary.estimate)}</span>
				<span aria-hidden="true" class="mx-1 opacity-50">/</span>
				{t('actual')} <span class="text-base font-semibold">{money(grandPrimary)}</span>
			</span>
		{/if}
	</div>
{/if}
