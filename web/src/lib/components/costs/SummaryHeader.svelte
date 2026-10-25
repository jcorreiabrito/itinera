<script lang="ts">
	import { TriangleAlert, Wallet } from 'lucide-svelte';
	import type { expenses } from '$lib/db';
	import { Button, Card } from '$lib/components/ui';
	import { formatMoney } from '$lib/format';
	import { t } from '$lib/i18n.svelte';
	import BudgetGauge from './BudgetGauge.svelte';

	interface Props {
		summary: expenses.BudgetSummary;
		onEditBudget: () => void;
	}

	let { summary, onEditBudget }: Props = $props();

	const home = $derived(summary.homeCurrency);
	const hasBudget = $derived(summary.budgetTotal != null);
	const money = (n: number | null | undefined) => formatMoney(n ?? 0, home);
</script>

<Card class="p-4 sm:p-5">
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h2 class="font-serif text-lg font-semibold">{t('costs_budget')}</h2>
			{#if hasBudget}
				<p class="mt-0.5 text-sm text-ink-muted">
					{t('costs_spent_label')}
					<span class="font-medium tabular-nums text-ink">{money(summary.spent)}</span>
					{t('costs_of')}
					<span class="tabular-nums">{money(summary.budgetTotal)}</span>
				</p>
			{:else}
				<p class="mt-0.5 text-sm text-ink-muted">{t('costs_no_budget')}</p>
			{/if}
		</div>
		<Button variant="secondary" size="sm" onclick={onEditBudget}>
			<Wallet class="size-4" />
			{hasBudget ? t('edit_budget') : t('costs_set_budget')}
		</Button>
	</div>

	<div class={hasBudget ? 'mt-4 grid gap-5 sm:grid-cols-[13rem_1fr] sm:items-center' : 'mt-4'}>
		{#if hasBudget && summary.budgetTotal != null}
			<BudgetGauge spent={summary.spent} total={summary.budgetTotal} homeCurrency={home} />
		{/if}
		<dl class="grid grid-cols-1 gap-2 text-center min-[390px]:grid-cols-3 sm:gap-3 sm:text-left">
			<div class="min-w-0 rounded-md bg-surface-sunken/60 p-2 sm:px-3 sm:py-2">
				<dt class="truncate text-[11px] font-medium text-ink-muted sm:text-xs">
					{t('estimated')}
				</dt>
				<dd class="mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-lg">
					{money(summary.estimate)}
				</dd>
			</div>
			<div class="min-w-0 rounded-md bg-surface-sunken/60 p-2 sm:px-3 sm:py-2">
				<dt class="truncate text-[11px] font-medium text-ink-muted sm:text-xs">{t('actual')}</dt>
				<dd class="mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-lg">
					{money(summary.actual)}
				</dd>
			</div>
			<div class="min-w-0 rounded-md bg-surface-sunken/60 p-2 sm:px-3 sm:py-2">
				<dt class="truncate text-[11px] font-medium text-ink-muted sm:text-xs">{t('unpaid')}</dt>
				<dd
					class="mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-lg {summary.unpaid > 0
						? 'text-accent-terracotta'
						: 'text-ink'}"
				>
					{money(summary.unpaid)}
				</dd>
			</div>
		</dl>
	</div>

	{#if summary.spent > 0}
		<p class="mt-3 text-xs text-ink-muted">
			{t('costs_averaging')}
			<span class="font-medium tabular-nums">{money(summary.dailyAverage)}</span>
			{t('costs_per_day')}
		</p>
	{/if}

	{#if summary.travelerCount > 1}
		<div class="mt-4 border-t border-border/60 pt-3.5">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-ink-muted/80">
				{t('costs_per_person_heading', { n: String(summary.travelerCount) })}
			</h4>
			<dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-ink-muted">
				<div class="flex justify-between border-b border-border/40 pb-1">
					<dt>{t('costs_spent_label')}</dt>
					<dd class="font-semibold tabular-nums text-ink">
						{money(summary.spent / summary.travelerCount)}
						{#if summary.budgetTotal != null}
							<span class="text-[10px] font-normal text-ink-muted">
								/ {money(summary.budgetTotal / summary.travelerCount)}</span
							>
						{/if}
					</dd>
				</div>
				<div class="flex justify-between border-b border-border/40 pb-1">
					<dt>{t('costs_daily_avg')}</dt>
					<dd class="font-semibold tabular-nums text-ink">
						{money(summary.dailyAverage / summary.travelerCount)}
					</dd>
				</div>
				<div class="flex justify-between border-b border-border/40 pb-1">
					<dt>{t('estimated')}</dt>
					<dd class="font-semibold tabular-nums text-ink">
						{money(summary.estimate / summary.travelerCount)}
					</dd>
				</div>
				<div class="flex justify-between border-b border-border/40 pb-1">
					<dt>{t('actual')}</dt>
					<dd class="font-semibold tabular-nums text-ink">
						{money(summary.actual / summary.travelerCount)}
					</dd>
				</div>
			</dl>
		</div>
	{/if}

	{#if summary.missingRateCount > 0}
		<p
			role="status"
			class="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0"
		>
			<TriangleAlert />
			<span>
				{summary.missingRateCount === 1
					? t('costs_missing_rate_one')
					: t('costs_missing_rate_many', { n: String(summary.missingRateCount) })}
			</span>
		</p>
	{/if}
</Card>
