<script lang="ts">
	import { trips, isDreamTrip } from '$lib/db';
	import { tripRangeLabel, formatNights } from '$lib/format';
	import TripCover from '$lib/components/trip/TripCover.svelte';

	interface Props {
		trip: trips.TripWithDerived;
	}

	let { trip }: Props = $props();

	import { formatDestinationRoute } from '$lib/destinations';
	import { t, type TranslationKey } from '$lib/i18n.svelte';

	const title = $derived(trip.title?.trim() || t('untitled_trip'));
	const destLabel = $derived(formatDestinationRoute(trip.destinations ?? []));

	const STATUS_LABEL_KEYS: Record<string, TranslationKey> = {
		Active: 'active_now',
		Upcoming: 'upcoming',
		Past: 'past',
		Archived: 'archived',
		Planning: 'planning',
		Dream: 'dream_status'
	};

	const statusLabel = $derived.by(() => {
		const key = STATUS_LABEL_KEYS[trip.derived.status];
		return key ? t(key) : trip.derived.status;
	});
</script>

<section aria-label={t('home_trip_summary')} class="relative overflow-hidden rounded-xl">
	<TripCover
		attId={trip.coverImageAttId}
		{title}
		blob="full"
		class="aspect-[16/9] w-full sm:aspect-[5/2]"
	/>
	<div
		class="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/35 to-transparent"
		aria-hidden="true"
	></div>

	<div class="absolute inset-x-0 bottom-0 p-4 text-white sm:p-6">
		<div class="flex flex-wrap items-center gap-2">
			<span class="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm">
				{statusLabel}
			</span>
			<span class="rounded-full bg-accent-terracotta px-2.5 py-1 text-xs font-semibold shadow-soft">
				{#if trip.derived.countdown}
					{trip.derived.countdown}
				{:else}
					{t('dates_flexible')}
				{/if}
			</span>
		</div>

		<h1
			class="mt-2 min-w-0 truncate font-serif text-2xl font-semibold text-white drop-shadow-sm sm:text-3xl"
		>
			{title}
		</h1>

		{#if destLabel}
			<p class="mt-1 min-w-0 truncate text-sm text-white/90">{destLabel}</p>
		{/if}

		<p class="mt-1 min-w-0 truncate text-sm text-white/80">
			{tripRangeLabel(trip)}
			{#if !isDreamTrip(trip)}
				<span class="text-white/60">·</span>
				{formatNights(trip.derived.nights)}
			{/if}
		</p>
	</div>
</section>
