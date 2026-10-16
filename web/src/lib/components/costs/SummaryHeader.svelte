<script lang="ts">
	import { TriangleAlert, Wallet } from 'lucide-svelte';
	import type { expenses } from '$lib/db';
	import { Button, Card } from '$lib/components/ui';
	import { formatMoney } from '$lib/format';
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
			<h2 class="font-serif text-lg font-semibold">Budget</h2>
			{#if hasBudget}
				<p class="mt-0.5 text-sm text-ink-muted">
					Spent <span class="font-medium tabular-nums text-ink">{money(summary.spent)}</span> of
					<span class="tabular-nums">{money(summary.budgetTotal)}</span>
				</p>
			{:else}
				<p class="mt-0.5 text-sm text-ink-muted">No budget set — tracking spend only.</p>
			{/if}
		</div>
		<Button variant="secondary" size="sm" onclick={onEditBudget}>
			<Wallet class="size-4" />
			{hasBudget ? 'Edit budget' : 'Set budget'}
		</Button>
	</div>

	<div class={hasBudget ? 'mt-4 grid gap-5 sm:grid-cols-[13rem_1fr] sm:items-center' : 'mt-4'}>
		{#if hasBudget && summary.budgetTotal != null}
			<BudgetGauge spent={summary.spent} total={summary.budgetTotal} homeCurrency={home} />
		{/if}
		<dl class="grid grid-cols-1 gap-2 text-center min-[390px]:grid-cols-3 sm:gap-3 sm:text-left">
			<div class="min-w-0 rounded-md bg-surface-sunken/60 p-2 sm:px-3 sm:py-2">
				<dt class="truncate text-[11px] font-medium text-ink-muted sm:text-xs">Estimated</dt>
				<dd class="mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-lg">
					{money(summary.estimate)}
				</dd>
			</div>
			<div class="min-w-0 rounded-md bg-surface-sunken/60 p-2 sm:px-3 sm:py-2">
				<dt class="truncate text-[11px] font-medium text-ink-muted sm:text-xs">Actual</dt>
				<dd class="mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-lg">
					{money(summary.actual)}
				</dd>
			</div>
			<div class="min-w-0 rounded-md bg-surface-sunken/60 p-2 sm:px-3 sm:py-2">
				<dt class="truncate text-[11px] font-medium text-ink-muted sm:text-xs">Unpaid</dt>
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
			Averaging <span class="font-medium tabular-nums">{money(summary.dailyAverage)}</span> per day.
		</p>
	{/if}

	{#if summary.travelerCount > 1}
		<div class="mt-4 border-t border-border/60 pt-3.5">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-ink-muted/80">
				Per Person ({summary.travelerCount} people)
			</h4>
			<dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-ink-muted">
				<div class="flex justify-between border-b border-border/40 pb-1">
					<dt>Spent</dt>
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
					<dt>Daily avg</dt>
					<dd class="font-semibold tabular-nums text-ink">
						{money(summary.dailyAverage / summary.travelerCount)}
					</dd>
				</div>
				<div class="flex justify-between border-b border-border/40 pb-1">
					<dt>Estimated</dt>
					<dd class="font-semibold tabular-nums text-ink">
						{money(summary.estimate / summary.travelerCount)}
					</dd>
				</div>
				<div class="flex justify-between border-b border-border/40 pb-1">
					<dt>Actual</dt>
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
				{summary.missingRateCount === 1 ? 'expense needs' : 'expenses need'} an exchange rate and
				{summary.missingRateCount === 1 ? "isn't" : "aren't"} counted in totals yet. Open
				{summary.missingRateCount === 1 ? 'it' : 'them'} to add a rate.
			</span>
		</p>
	{/if}
</Card>
