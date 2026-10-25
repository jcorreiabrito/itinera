<script lang="ts">
	import type { expenses } from '$lib/db';
	import { formatMoney } from '$lib/format';
	import { Badge } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import CostBar from './CostBar.svelte';
	import CategoryDonut from './CategoryDonut.svelte';
	import { categoryIcon, categoryLabel } from './labels';

	interface Props {
		categories: expenses.CategoryBudgetRow[];
		homeCurrency: string;
		summary: expenses.BudgetSummary;
		unpaidOnly?: boolean;
	}

	let { categories, homeCurrency, summary, unpaidOnly = false }: Props = $props();

	const money = (n: number) => formatMoney(n, homeCurrency);

	const visible = $derived(
		categories.filter((c) => (unpaidOnly ? c.totals.unpaid > 0 : c.totals.spent > 0))
	);

	const scale = $derived(
		Math.max(1, ...categories.map((c) => Math.max(c.totals.spent, c.cap ?? 0)))
	);
</script>

{#if visible.length == 0}
	<p
		class="rounded-lg border border-dashed border-border bg-surface-sunken px-4 py-8 text-center text-sm text-ink-muted"
	>
		{unpaidOnly ? t('costs_nothing_outstanding') : t('no_costs_yet')}
	</p>
{:else}
	<CategoryDonut {categories} {homeCurrency} {unpaidOnly} class="mb-4" />

	<ul class="space-y-2.5">
		{#each visible as row (row.category)}
			{@const totals = row.totals}
			{@const Icon = categoryIcon(row.category)}
			<li class="rounded-lg border border-border bg-surface p-3.5 shadow-soft">
				<div class="flex items-baseline justify-between gap-3">
					<h3 class="flex items-center gap-2 font-medium [&_svg]:size-4 [&_svg]:text-ink-muted">
						<Icon aria-hidden="true" />
						{categoryLabel(row.category)}
					</h3>
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
							target={row.cap}
							max={scale}
							tone={row.overCap ? 'warning' : 'primary'}
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
						{#if row.overCap && row.cap != null}
							<Badge variant="warning">
								{t('costs_over_cap', { amount: money(totals.spent - row.cap) })}
							</Badge>
						{:else if row.cap != null}
							<span class="tabular-nums">{t('costs_cap', { amount: money(row.cap) })}</span>
						{/if}
					</div>
				{/if}

				<span class="sr-only">
					{t('costs_sr_category_spent', {
						category: categoryLabel(row.category),
						amount: money(totals.spent)
					})}{row.cap != null ? t('costs_sr_of_cap', { amount: money(row.cap) }) : ''}{row.overCap
						? t('costs_sr_over_cap')
						: ''}.
					{#if totals.unpaid > 0}{t('costs_sr_unpaid', {
							amount: money(totals.unpaid)
						})}{/if}
				</span>
			</li>
		{/each}
	</ul>

	<div
		class="mt-4 flex flex-col gap-1 rounded-lg bg-primary-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
	>
		<span class="font-medium text-primary-700">{t('costs_total')}</span>
		{#if unpaidOnly}
			<span class="font-semibold tabular-nums text-primary-700">{money(summary.unpaid)}</span>
		{:else}
			<span class="text-sm font-medium tabular-nums text-primary-700">
				{t('estimated')} <span class="text-base font-semibold">{money(summary.estimate)}</span>
				<span aria-hidden="true" class="mx-1 opacity-50">/</span>
				{t('actual')} <span class="text-base font-semibold">{money(summary.actual)}</span>
			</span>
		{/if}
	</div>
{/if}
