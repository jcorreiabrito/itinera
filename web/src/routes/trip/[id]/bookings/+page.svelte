<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { FlightsPane } from '$lib/components/flights';
	import { ReservationsPane } from '$lib/components/reservations';
	import { t } from '$lib/i18n.svelte';
	import { cn } from '$lib/utils';

	const id = $derived(page.params.id ?? '');

	/*
	 * Flights is the default, matching TRIP_SECTIONS: a bare /bookings URL used
	 * to render Reservations while the sidebar highlighted Flights, so the app
	 * disagreed with itself about which tab you were on.
	 */
	const tab = $derived(
		page.url.searchParams.get('tab') === 'reservations' ? 'reservations' : 'flights'
	);

	/* Deep links: /bookings?tab=flights&flight=flight:XX opens that record. */
	const flightId = $derived(page.url.searchParams.get('flight') ?? undefined);
	const reservationId = $derived(page.url.searchParams.get('reservation') ?? undefined);

	const segClass = (active: boolean) =>
		cn(
			'inline-flex min-h-touch items-center rounded-md px-3 py-1.5 font-medium transition-colors',
			active ? 'bg-surface text-ink shadow-soft' : 'text-ink-muted hover:text-ink'
		);
</script>

<svelte:head>
	<title>{t('bookings')} – Itinera</title>
</svelte:head>

<section aria-labelledby="bookings-heading">
	<h2 id="bookings-heading" class="sr-only">{t('bookings')}</h2>

	<nav
		class="mt-4 flex w-full rounded-lg border border-border bg-surface-sunken p-1 text-sm sm:inline-flex"
		aria-label={t('bookings_type_label')}
	>
		<a
			href={resolve(`/trip/${id}/bookings?tab=flights`)}
			aria-current={tab === 'flights' ? 'page' : undefined}
			class={cn(segClass(tab === 'flights'), 'flex-1 justify-center text-center')}
		>
			{t('flights')}
		</a>
		<a
			href={resolve(`/trip/${id}/bookings?tab=reservations`)}
			aria-current={tab === 'reservations' ? 'page' : undefined}
			class={cn(segClass(tab === 'reservations'), 'flex-1 justify-center text-center')}
		>
			{t('reservations')}
		</a>
	</nav>

	{#if tab === 'flights'}
		{#key id}
			<FlightsPane tripId={id} initialId={flightId} />
		{/key}
	{:else}
		{#key id}
			<ReservationsPane tripId={id} initialId={reservationId} />
		{/key}
	{/if}
</section>
