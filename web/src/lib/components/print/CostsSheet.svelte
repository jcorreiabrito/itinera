<script lang="ts">
	import type { expenses } from '$lib/db';
	import { categoryLabel } from '$lib/components/costs/labels';
	import { formatMoney } from '$lib/format';
	import { t } from '$lib/i18n.svelte';

	interface Props {
		summary: expenses.BudgetSummary;
		categories: readonly expenses.CategoryBudgetRow[];
		homeCurrency: string;
		travelerCount: number;
	}

	let { summary, categories, homeCurrency, travelerCount }: Props = $props();
</script>

<div class="mt-3 text-sm">
	<!-- Ink-light on purpose: hairlines and figures, no filled panels. -->
	<table class="w-full border-collapse">
		<thead>
			<tr class="border-b border-ink/30 text-left text-xs uppercase tracking-wide text-ink-muted">
				<th scope="col" class="py-1.5 font-medium">{t('category')}</th>
				<th scope="col" class="py-1.5 text-right font-medium">{t('spent')}</th>
			</tr>
		</thead>
		<tbody>
			{#each categories as row (row.category)}
				{#if row.totals.spent > 0 || row.cap != null}
					<tr class="border-b border-border/60">
						<th scope="row" class="py-1.5 text-left font-normal">
							{categoryLabel(row.category)}
						</th>
						<td class="py-1.5 text-right tabular-nums">
							{formatMoney(row.totals.spent, homeCurrency, { decimals: true })}
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
		<tfoot>
			{#if summary.budgetTotal != null}
				<tr class="border-t border-border">
					<th scope="row" class="py-1.5 text-left font-normal text-ink-muted">
						{t('budget_total')}
					</th>
					<td class="py-1.5 text-right tabular-nums">
						{formatMoney(summary.budgetTotal, homeCurrency, { decimals: true })}
					</td>
				</tr>
			{/if}
			<tr class="border-t-2 border-ink/30">
				<th scope="row" class="py-2 text-left font-semibold">{t('costs_total')}</th>
				<td class="py-2 text-right font-semibold tabular-nums">
					{formatMoney(summary.spent, homeCurrency, { decimals: true })}
				</td>
			</tr>
			{#if travelerCount > 1}
				<tr>
					<th scope="row" class="py-1 text-left font-normal text-ink-muted">
						{t('print_per_person')}
					</th>
					<td class="py-1 text-right tabular-nums text-ink-muted">
						{formatMoney(summary.spent / travelerCount, homeCurrency, { decimals: true })}
					</td>
				</tr>
			{/if}
			{#if summary.remaining != null}
				<tr>
					<th scope="row" class="py-1 text-left font-normal text-ink-muted">
						{summary.remaining < 0 ? t('over_budget') : t('remaining')}
					</th>
					<td class="py-1 text-right tabular-nums">
						{formatMoney(Math.abs(summary.remaining), homeCurrency, { decimals: true })}
					</td>
				</tr>
			{/if}
		</tfoot>
	</table>
	{#if summary.missingRateCount > 0}
		<p class="mt-3 max-w-prose text-xs text-ink-muted">
			{summary.missingRateCount === 1
				? t('print_missing_rate_one')
				: t('print_missing_rate_many', { n: String(summary.missingRateCount) })}
		</p>
	{/if}
</div>
