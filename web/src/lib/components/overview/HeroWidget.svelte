<script lang="ts">
    import { trips } from '$lib/db';
    import { flagEmoji, formatDateRange, formatNights } from '$lib/format';
    import TripCover from '$lib/components/trip/TripCover.svelte';

    interface Props {
        trip: trips.TripWithDerived;
    }

    let { trip }: Props = $props();

    const title = $derived(trip.title?.trim() || 'Untitled trip');
    const destLabel = $derived(
        (trip.destinations ?? [])
            .map((d) => `${flagEmoji(d.country)} ${d.name}`.trim())
            .filter(Boolean)
            .join(', ')
    );
    const statusLabel = $derived(trip.derived.status);
</script>

<section aria-label="trip summary" class="relative overflow-hidden rounded-xl">
    <TripCover attId={trip.coverImageAttId} {title} blob="full" class="aspect-[16/9] w-full sm:aspect-[5/2]" />
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
                {trip.derived.countdown}
            </span>
        </div>

        <h1 class="mt-2 font-serif text-2xl font-semibold drop-shadow-sm sm:text-3xl">{title}</h1>

        {#if destLabel}
            <p class="mt-1 text-sm text-white/90">{destLabel}</p>
        {/if}

        <p class="mt-1 text-sm text-white/80">
            {formatDateRange(trip.startDate, trip.endDate)}
            <span class="text-white/60">·</span>
            {formatNights(trip.derived.nights)}
        </p>
    </div>
</section>