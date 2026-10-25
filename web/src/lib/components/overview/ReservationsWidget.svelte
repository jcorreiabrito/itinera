<script lang="ts">
	import type { Reservation } from '$lib/db';
	import type { ReservationSummary } from '$lib/overview';
	import { BedDouble } from 'lucide-svelte';
	import { formatDate, relativeTime } from '$lib/format';
	import type { ResolvedPathname } from '$app/types';
	import WidgetCard from './WidgetCard.svelte';
	import { t, type TranslationKey } from '$lib/i18n.svelte';

	interface Props {
		summary: ReservationSummary;
		reservations: Reservation[];
		href: ResolvedPathname;
	}

	let { summary, reservations, href }: Props = $props();

	const KIND_LABEL_KEYS: Record<string, [TranslationKey, TranslationKey]> = {
		lodging: ['res_kind_hotel_one', 'res_kind_hotel_many'],
		car: ['res_kind_car_one', 'res_kind_car_many'],
		restaurant: ['res_kind_restaurant_one', 'res_kind_restaurant_many'],
		activity: ['res_kind_activity_one', 'res_kind_activity_many'],
		transport: ['res_kind_transfer_one', 'res_kind_transfer_many'],
		other: ['res_kind_booking_one', 'res_kind_booking_many']
	};

	const countsLabel = $derived(
		summary.counts
			.map((c) => {
				const keys = KIND_LABEL_KEYS[c.kind] ?? KIND_LABEL_KEYS.other;
				return t(keys[c.count === 1 ? 0 : 1], { n: String(c.count) });
			})
			.join(', ')
	);

	const shown = $derived(reservations.slice(0, 5));
</script>

<WidgetCard title={t('reservations')} icon={BedDouble} {href} linkLabel={t('reservations')}>
	{#if summary.total === 0}
		<p class="text-sm text-ink-muted">
			{t('home_none_yet')} –
			<a {href} class="font-medium text-primary-700 hover:underline">{t('home_add_booking')}</a>.
		</p>
	{:else}
		<p class="text-sm font-medium text-ink">{countsLabel}</p>
		{#if summary.nextCheckIn}
			<p class="mt-1 text-xs text-ink-muted">
				{t('next_check_in')}: {summary.nextCheckIn.reservation.name ?? t('label_reservation')},
				{formatDate(summary.nextCheckIn.whenIso)} ({relativeTime(summary.nextCheckIn.whenIso)})
			</p>
		{/if}
		<ul class="mt-3 space-y-1.5">
			{#each shown as res (res._id)}
				<li class="flex min-w-0 items-center justify-between gap-2 text-sm">
					<span class="min-w-0 flex-1 truncate text-ink">{res.name ?? t('label_reservation')}</span>
					<span class="shrink-0 text-xs text-ink-muted">
						{res.start ? formatDate(res.start) : ''}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</WidgetCard>
