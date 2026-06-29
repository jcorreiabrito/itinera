<script lang="ts">
  import { page } from '$app/state';
  import { FlightsPane } from '$lib/components/flights';
  import { ReservationsPane } from '$lib/components/reservations';
  import { cn } from '$lib/utils';

  const id = $derived(page.params.id ?? '');

  const tab = $derived(
    page.url.searchParams.get('tab') === 'flights' ? 'flights' : 'reservations'
  );

  const segClass = (active: boolean) =>
    cn(
      'inline-flex min-h-touch items-center rounded-md px-3 py-1.5 font-medium transition-colors',
      active ? 'bg-surface text-ink shadow-soft' : 'text-ink-muted hover:text-ink'
    );
</script>

<svelte:head>
  <title>Bookings – Itinera</title>
</svelte:head>

<section aria-labelledby="bookings-heading">
  <h1 id="bookings-heading" class="sr-only">Bookings</h1>

  <nav
    class="mt-4 inline-flex rounded-lg border border-border bg-surface-sunken p-1 text-sm"
    aria-label="Bookings type"
  >
    <a
      href={`/trip/${id}/bookings?tab=flights`}
      aria-current={tab === 'flights' ? 'page' : undefined}
      class={segClass(tab === 'flights')}
    >
      Flights
    </a>
    <a
      href={`/trip/${id}/bookings?tab=reservations`}
      aria-current={tab === 'reservations' ? 'page' : undefined}
      class={segClass(tab === 'reservations')}
    >
      Reservations
    </a>
  </nav>

  {#if tab === 'flights'}
    {#key id}
      <FlightsPane tripId={id} />
    {/key}
  {:else}
    {#key id}
      <ReservationsPane tripId={id} />
    {/key}
  {/if}
</section>
