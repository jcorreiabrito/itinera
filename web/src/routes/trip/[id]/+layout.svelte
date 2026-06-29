<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { page } from '$app/state';
  import { trips } from '$lib/db';
  import type { Trip } from '$lib/db';
  import {
    ArrowLeft,
    BedDouble,
    CalendarDays,
    LayoutDashboard,
    ListChecks,
    MapPinned,
    Pencil,
    Plane,
    Wallet
  } from 'lucide-svelte';
  import type { IconComponent } from '$lib/types';
  import { Skeleton, SyncStatusPill } from '$lib/components/ui';
  import { TripDataMenu, TripFormSheet } from '$lib/components/trip';
  import { setTripShellContext } from '$lib/trip-context';
  import { startLive } from '$lib/live';
  import { cn } from '$lib/utils';

  let { children }: { children: Snippet } = $props();

  let trip = $state<Trip | null>(null);
  let loaded = $state(false);
  let editOpen = $state(false);
  const reloadSignal = writable(0);

  const id = $derived(page.params.id ?? '');
  const pathname = $derived(page.url.pathname);
  const tab = $derived(page.url.searchParams.get('tab'));

  async function loadTrip(tripid: string) {
    try {
      trip = await trips.getTrip(tripid);
    } catch {
      trip = null;
    } finally {
      loaded = true;
    }
  }

  function requestReload() {
    reloadSignal.update((n) => n + 1);
    loadTrip(page.params.id ?? '');
  }

  function openEditor() {
    editOpen = true;
  }

  setTripShellContext({ reloadSignal, requestReload, openEditor });

  // Reload the header trip whenever the route id changes.
  $effect(() => {
    const tid = id;
    loaded = false;
    loadTrip(tid);
  });

  onMount(() => startLive(() => loadTrip(page.params.id ?? '')));

  function isActive(seg: string): boolean {
    return pathname.startsWith(`/trip/${id}/${seg}`);
  }

  const bookingsActive = $derived(pathname.startsWith(`/trip/${id}/bookings`));

  const tabs: { label: string; icon: IconComponent; seg: string }[] = $derived([
    { label: 'Overview', icon: LayoutDashboard, seg: 'overview' },
    { label: 'Itinerary', icon: CalendarDays, seg: 'itinerary' },
    { label: 'Bookings', icon: Plane, seg: 'bookings' },
    { label: 'Checklist', icon: ListChecks, seg: 'checklist' },
  ]);
</script>

{#snippet sideLink(href: string, label: string, icon: IconComponent, active: boolean)}
    {@const Icon = icon}
    <a
      {href}
      aria-current={active ? 'page' : undefined}
      class={cn(
        'flex min-h-touch items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-5',
        active
          ? 'bg-primary-100 text-primary-700'
          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
      )}
    >
      <Icon />
      <span>{label}</span>
    </a>
  {/snippet}

  <div class="flex min-h-dvh flex-col">
    <!-- Desktop sidebar -->
    <aside
      class="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface lg:flex"
    >
      <a
        href="/"
        class="flex h-16 items-center gap-2 border-b border-border px-4 text-sm font-medium text-ink-muted transition-colors hover:text-ink [&_svg]:size-4"
      >
        <ArrowLeft />
        <span>All trips</span>
      </a>
      <nav aria-label="Trip sections" class="flex-1 overflow-y-auto p-3">
        <ul class="flex flex-col gap-1">
          <li>{@render sideLink(`/trip/${id}/overview`, 'Overview', LayoutDashboard, isActive('overview'))}</li>
          <li>{@render sideLink(`/trip/${id}/itinerary`, 'Itinerary', CalendarDays, isActive('itinerary'))}</li>
          <li>{@render sideLink(`/trip/${id}/checklist`, 'Checklist', ListChecks, isActive('checklist'))}</li>
          <li class="mt-2">
            <p class="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted/70">
              Bookings
            </p>
            <ul class="flex flex-col gap-1">
              <li>
                {@render sideLink(
                  `/trip/${id}/bookings?tab=flights`,
                  'Flights',
                  Plane,
                  bookingsActive && tab !== 'reservations'
                )}
              </li>
              <li>
                {@render sideLink(
                  `/trip/${id}/bookings?tab=reservations`,
                  'Reservations',
                  BedDouble,
                  bookingsActive && tab === 'reservations'
                )}
              </li>
            </ul>
          </li>
          <li class="mt-2">{@render sideLink(`/trip/${id}/costs`, 'Costs', Wallet, isActive('costs'))}</li>
        </ul>
      </nav>
      <div class="border-t border-border p-4 text-xs text-ink-muted">Offline-ready</div>
    </aside>

    <!-- Content column -->
    <div class="flex min-h-dvh flex-col lg:pl-60">
      <header
        class="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-md sm:px-6"
      >
        <div class="flex min-w-0 items-center gap-2">
          <a
            href="/"
            aria-label="Back to all trips"
            class="grid size-9 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink lg:hidden [&_svg]:size-5"
          >
            <ArrowLeft />
          </a>
          {#if loaded}
            <h1 class="truncate font-serif text-lg font-semibold">
              {trip?.title?.trim() || 'Trip'}
            </h1>
          {:else}
            <Skeleton class="h-5 w-40" />
          {/if}
        </div>

        <div class="flex items-center gap-1.5">
          <SyncStatusPill />
          <button
            type="button"
            onclick={openEditor}
            disabled={!trip}
            aria-label="Edit trip"
            class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-40 [&_svg]:size-5"
          >
            <Pencil />
          </button>
          {#if trip}
            <TripDataMenu tripid={id} title={trip.title?.trim() || undefined} />
          {/if}
        </div>
      </header>

      <main class="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-12">
        {#if loaded && !trip}
          <div class="flex min-h-[50dvh] flex-col items-center justify-center text-center">
            <MapPinned class="size-10 text-ink-muted" aria-hidden="true" />
            <h2 class="mt-4 text-xl font-semibold">Trip not found</h2>
            <p class="mt-1 text-ink-muted">It may have been deleted on another device.</p>
            <a
              href="/"
              class="mt-5 inline-flex h-11 items-center rounded-md bg-primary-600 px-4 font-medium text-white shadow-soft transition-colors hover:bg-primary-700"
            >
              Back to trips
            </a>
          </div>
        {:else}
          {@render children()}
        {/if}
      </main>

      <!-- Mobile bottom tab bar -->
      <nav
        aria-label="Trip sections"
        class="pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md lg:hidden"
      >
        <ul class="mx-auto flex max-w-xl items-stretch justify-around">
          {#each tabs as item (item.seg)}
            {@const Icon = item.icon}
            {@const active = isActive(item.seg)}
            <li class="flex-1">
              <a
                href={`/trip/${id}/${item.seg}`}
                aria-current={active ? 'page' : undefined}
                class={cn(
                  'flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[0.7rem] font-medium transition-colors [&_svg]:size-5',
                  active ? 'text-primary-600' : 'text-ink-muted hover:text-ink'
                )}
              >
                <Icon />
                <span>{item.label}</span>
              </a>
            </li>
          {/each}
        </ul>
      </nav>
    </div>
  </div>

  <TripFormSheet bind:open={editOpen} mode="edit" {trip} onsaved={requestReload} onlivechange={requestReload} />
