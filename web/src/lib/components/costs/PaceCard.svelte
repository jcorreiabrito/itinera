<script lang="ts">
	import { Gauge } from 'lucide-svelte';
	import type { Expense, Trip } from '$lib/db';
	import { todayIso } from '$lib/db/datetime';
	import { forecastPace } from '$lib/db/pace';
	import { Card } from '$lib/components/ui';
	import { formatMoney } from '$lib/format';
	import { t } from '$lib/i18n.svelte';

	interface Props {
		trip: Trip;
		/** Every expense of the trip, as the costs pane already loads them. */
		expenses: Expense[];
		/** Defaults to the device's local date; a prop so tests can pin the day. */
		today?: string;
	}

	let { trip, expenses, today = todayIso() }: Props = $props();

	const forecast = $derived(
		forecastPace(
			expenses,
			{
				startDate: trip.startDate ?? null,
				endDate: trip.endDate ?? null,
				budget: trip.budget ?? null,
				homeCurrency: trip.homeCurrency ?? null,
				travelerCount: trip.travelerCount ?? 1
			},
			today
		)
	);

	const home = $derived(trip.homeCurrency ?? 'EUR');
	const money = (n: number) => formatMoney(n, home);

	/*
	 * Before the trip there is no daily rate to extrapolate, and without a
	 * budget there is nothing to be ahead or behind of. Both are the summary
	 * header's job; this card only appears when it can answer "will we make it".
	 */
	const show = $derived(forecast.state === 'on-track' || forecast.state === 'over');
	const over = $derived(forecast.state === 'over');

	/*
	 * A projection exists once at least one trip day has passed. When the trip
	 * is already over budget before that (a prepaid flight above the budget),
	 * `projectedTotal` is null and the card states the overrun directly.
	 */
	const sentence = $derived.by(() => {
		if (forecast.projectedTotal != null && forecast.budgetTotal != null) {
			const replacement = {
				projected: money(forecast.projectedTotal),
				amount: money(Math.abs(forecast.overUnder ?? 0)),
				budget: money(forecast.budgetTotal)
			};
			return (forecast.overUnder ?? 0) > 0
				? t('pace_finish_over', replacement)
				: t('pace_finish_under', replacement);
		}
		if (forecast.budgetTotal != null) {
			return t('pace_already_over', {
				amount: money(forecast.spent - forecast.budgetTotal),
				budget: money(forecast.budgetTotal)
			});
		}
		return '';
	});

	const stats = $derived.by(() => {
		const items: { key: string; label: string; value: string }[] = [];
		if (forecast.totalDays != null && forecast.daysElapsed > 0) {
			items.push({
				key: 'day',
				label: t('pace_day_label'),
				value: t('pace_day_value', {
					day: String(forecast.daysElapsed),
					total: String(forecast.totalDays)
				})
			});
		}
		if (forecast.perDayRate != null) {
			items.push({
				key: 'rate',
				label: t('pace_rate_label'),
				value: money(forecast.perDayRate)
			});
		}
		if (forecast.perDayAllowance != null && forecast.perDayAllowance >= 0) {
			items.push({
				key: 'allowance',
				label: t('pace_allowance_label'),
				value: money(forecast.perDayAllowance)
			});
		}
		return items;
	});
</script>

{#if show}
	<Card class="p-4 sm:p-5">
		<div class="flex items-start justify-between gap-3">
			<div class="flex min-w-0 items-center gap-2">
				<Gauge class="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
				<h2 class="truncate font-serif text-lg font-semibold">{t('pace_title')}</h2>
			</div>
			<span
				class={over
					? 'inline-flex shrink-0 items-center rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger'
					: 'inline-flex shrink-0 items-center rounded-full bg-primary-600/10 px-2.5 py-1 text-xs font-semibold text-primary-700'}
			>
				{over ? t('pace_state_over') : t('pace_state_on_track')}
			</span>
		</div>

		<p class="mt-2 text-sm text-ink-muted">{sentence}</p>

		<dl class="mt-3 grid grid-cols-1 gap-2 text-center min-[390px]:grid-cols-3 sm:text-left">
			{#each stats as stat (stat.key)}
				<div class="min-w-0 rounded-md bg-surface-sunken/60 p-2 sm:px-3 sm:py-2">
					<dt class="truncate text-[11px] font-medium text-ink-muted sm:text-xs">{stat.label}</dt>
					<dd class="mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-base">
						{stat.value}
					</dd>
				</div>
			{/each}
		</dl>
	</Card>
{/if}
