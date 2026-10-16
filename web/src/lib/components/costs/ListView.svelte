<script lang="ts">
	import { Search } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { expenseAmounts } from '$lib/db';
	import type { Expense } from '$lib/db';
	import { Input, Select } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import type { CostsPaidFilter, CostsSort } from '$lib/utils/url-state';
	import { categoryLabel } from './labels';
	import ExpenseRow from './ExpenseRow.svelte';

	/*
	 * `search`, `paidFilter` and `sort` are bindable and owned by the pane, not
	 * kept here: they outlive this component — switching to the day or category
	 * view unmounts the list — and they live in the URL, which is what a reload
	 * and a shared link carry.
	 */
	interface Props {
		expenses: Expense[];
		homeCurrency: string;
		/** Global unpaid-only master toggle (overrides the local paid filter). */
		unpaidOnly?: boolean;
		travelerCount?: number;
		search?: string;
		paidFilter?: CostsPaidFilter;
		sort?: CostsSort;
		onedit: (expense: Expense) => void;
		ontogglePaid: (expense: Expense) => void;
	}

	let {
		expenses,
		homeCurrency,
		unpaidOnly = false,
		travelerCount = 1,
		search = $bindable(''),
		paidFilter = $bindable<CostsPaidFilter>('all'),
		sort = $bindable<CostsSort>('date'),
		onedit,
		ontogglePaid
	}: Props = $props();

	const homeSpent = (e: Expense) => {
		const base = expenseAmounts(e, homeCurrency).spent ?? 0;
		return e.costType === 'per_person' ? base * travelerCount : base;
	};

	const rows = $derived.by(() => {
		const q = search.trim().toLowerCase();
		let list = expenses.slice();

		if (unpaidOnly) list = list.filter((e) => !e.paid);
		else if (paidFilter === 'paid') list = list.filter((e) => e.paid);
		else if (paidFilter === 'unpaid') list = list.filter((e) => !e.paid);

		if (q) {
			list = list.filter(
				(e) =>
					(e.description ?? '').toLowerCase().includes(q) ||
					categoryLabel(e.category ?? 'other')
						.toLowerCase()
						.includes(q)
			);
		}

		if (sort === 'amount') {
			list.sort((a, b) => homeSpent(b) - homeSpent(a));
		} else {
			list.sort((a, b) => {
				const ad = a.date ?? '';
				const bd = b.date ?? '';
				if (ad && bd) return ad < bd ? 1 : ad > bd ? -1 : 0;
				if (ad && !bd) return -1;
				if (!ad && bd) return 1;
				return 0;
			});
		}
		return list;
	});

	const chipClass = (active: boolean) =>
		cn(
			`inline-flex min-h-touch items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
				active
					? 'border-primary-600 bg-primary-600 text-white'
					: 'border-border bg-surface text-ink-muted hover:text-ink'
			}`
		);
</script>

<div class="space-y-3">
	<div class="relative">
		<Search
			class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
			aria-hidden="true"
		/>
		<Input
			type="search"
			value={search}
			placeholder={t('search_expenses')}
			class="pl-9"
			oninput={(e) => (search = e.currentTarget.value)}
		/>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-3">
		{#if !unpaidOnly}
			<div class="flex flex-wrap gap-2" role="group" aria-label={t('filter_by_paid_status')}>
				<button
					type="button"
					onclick={() => (paidFilter = 'all')}
					aria-pressed={paidFilter === 'all'}
					class={chipClass(paidFilter === 'all')}>{t('filter_all')}</button
				>
				<button
					type="button"
					onclick={() => (paidFilter = 'unpaid')}
					aria-pressed={paidFilter === 'unpaid'}
					class={chipClass(paidFilter === 'unpaid')}>{t('unpaid')}</button
				>
				<button
					type="button"
					onclick={() => (paidFilter = 'paid')}
					aria-pressed={paidFilter === 'paid'}
					class={chipClass(paidFilter === 'paid')}>{t('paid')}</button
				>
			</div>
		{:else}
			<p class="text-sm text-ink-muted">{t('showing_unpaid_only')}</p>
		{/if}

		<label class="flex items-center gap-2 text-sm text-ink-muted">
			<span>{t('sort')}</span>
			<Select
				value={sort}
				class="h-9 w-auto"
				onchange={(e) => (sort = e.currentTarget.value as CostsSort)}
			>
				<option value="date">{t('by_date')}</option>
				<option value="amount">{t('by_amount')}</option>
			</Select>
		</label>
	</div>

	{#if rows.length === 0}
		<p
			class="rounded-lg border border-dashed border-border bg-surface-sunken px-4 py-8 text-center text-sm text-ink-muted"
		>
			{t('no_matching_expenses')}
		</p>
	{:else}
		<p class="text-xs text-ink-muted">
			{rows.length === 1
				? t('expense_count_one', { n: String(rows.length) })
				: t('expense_count_many', { n: String(rows.length) })}
		</p>
		<ul class="space-y-2.5">
			{#each rows as expense (expense._id)}
				<ExpenseRow
					{expense}
					{homeCurrency}
					onedit={() => onedit(expense)}
					ontogglePaid={() => ontogglePaid(expense)}
				/>
			{/each}
		</ul>
	{/if}
</div>
