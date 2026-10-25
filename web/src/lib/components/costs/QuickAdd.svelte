<script lang="ts">
	import { Plus } from 'lucide-svelte';
	import { expenses, todayIso } from '$lib/db';
	import type { ExpenseCategory } from '$lib/db';
	import { Button, Input, Select, toast } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import { CATEGORY_ORDER, CATEGORY_META, categoryLabel, currencyOptions } from './labels';
	import { getSuggestedFxRate } from '$lib/utils/currency';

	interface Props {
		/** Bare trip ULID. */
		tripId: string;
		homeCurrency: string;
		onsaved?: () => void;
	}

	let { tripId, homeCurrency, onsaved }: Props = $props();

	let amount = $state('');
	let selectedCurrency = $state('EUR');
	let category = $state<ExpenseCategory>('food');
	let date = $state(todayIso());
	let saving = $state(false);

	$effect(() => {
		if (homeCurrency) {
			selectedCurrency = homeCurrency;
		}
	});

	const amountNum = $derived(Number(amount));
	const valid = $derived(amount.trim() !== '' && Number.isFinite(amountNum) && amountNum > 0);

	async function add() {
		if (!valid || saving) return;
		saving = true;
		try {
			const isForeign = selectedCurrency !== homeCurrency;
			const fxRate = isForeign ? getSuggestedFxRate(selectedCurrency, homeCurrency) : undefined;
			await expenses.create(tripId, {
				description: categoryLabel(category),
				category,
				date: date || null,
				amountActual: amountNum,
				currency: selectedCurrency,
				fxRate: fxRate ?? undefined,
				paid: false
			});
			amount = '';
			onsaved?.();
		} catch {
			toast.error(t('could_not_add_expense'));
		} finally {
			saving = false;
		}
	}
</script>

<form
	class="grid grid-cols-2 gap-2.5 rounded-lg border border-border bg-surface p-3 shadow-soft sm:flex sm:flex-wrap sm:items-end sm:gap-2"
	onsubmit={(e) => {
		e.preventDefault();
		add();
	}}
>
	<div class="col-span-1 min-w-0 sm:min-w-[6.5rem] sm:flex-1">
		<label for="quick-amount" class="mb-1 block text-xs font-medium text-ink-muted">
			{t('costs_amount')}
		</label>
		<Input
			id="quick-amount"
			type="number"
			inputmode="decimal"
			min={0}
			step="any"
			value={amount}
			placeholder="0.00"
			oninput={(e) => (amount = e.currentTarget.value)}
		/>
	</div>

	<div class="col-span-1 min-w-0 sm:w-24 sm:shrink-0">
		<label for="quick-currency" class="mb-1 block text-xs font-medium text-ink-muted"
			>{t('currency')}</label
		>
		<Select
			id="quick-currency"
			value={selectedCurrency}
			onchange={(e) => (selectedCurrency = e.currentTarget.value)}
		>
			{#each currencyOptions(homeCurrency) as code (code)}
				<option value={code}>{code}</option>
			{/each}
		</Select>
	</div>

	<div class="col-span-1 min-w-0 sm:min-w-[8rem] sm:flex-1">
		<label for="quick-category" class="mb-1 block text-xs font-medium text-ink-muted"
			>{t('category')}</label
		>
		<Select
			id="quick-category"
			value={category}
			onchange={(e) => (category = e.currentTarget.value as ExpenseCategory)}
		>
			{#each CATEGORY_ORDER as cat (cat)}
				<option value={cat}>{CATEGORY_META[cat].label}</option>
			{/each}
		</Select>
	</div>

	<div class="col-span-1 min-w-0 sm:min-w-[8.5rem] sm:flex-1">
		<label for="quick-date" class="mb-1 block text-xs font-medium text-ink-muted">
			{t('label_day')}
		</label>
		<Input
			id="quick-date"
			type="date"
			value={date}
			oninput={(e) => (date = e.currentTarget.value)}
		/>
	</div>

	<div class="col-span-2 sm:col-span-1 sm:shrink-0">
		<Button type="submit" disabled={!valid || saving} class="w-full sm:w-auto">
			<Plus class="size-4" />
			{t('add')}
		</Button>
	</div>
</form>
