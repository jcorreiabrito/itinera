<script lang="ts">
  import type { Destination } from '$lib/db';
  import { flagEmoji, formatDateRange } from '$lib/format';
  import { CalendarDays, MapPin, Pencil } from 'lucide-svelte';
  import { Card } from '$lib/components/ui';

  interface Props {
    destinations: Destination[];
    startDate?: string;
    endDate?: string;
    onedit?: () => void;
  }

  let { destinations = [], startDate, endDate, onedit }: Props = $props();

  function calcDays(arrive?: string, depart?: string): string | null {
    if (!arrive || !depart) return null;
    const a = new Date(arrive);
    const d = new Date(depart);
    if (isNaN(a.getTime()) || isNaN(d.getTime())) return null;
    const diff = Math.round((d.getTime() - a.getTime()) / (1000 * 3600 * 24)) + 1;
    return diff > 0 ? `${diff} ${diff === 1 ? 'day' : 'days'}` : null;
  }
</script>

<Card class="flex flex-col p-4 glass-panel">
  <div class="mb-3 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="grid size-7 place-items-center rounded-md bg-primary-100 text-primary-700">
        <MapPin class="size-4" />
      </span>
      <h2 class="font-serif text-base font-semibold text-ink">
        Trip Route & Destinations ({destinations.length})
      </h2>
    </div>
    {#if onedit}
      <button
        type="button"
        onclick={onedit}
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-sunken hover:text-ink"
      >
        <Pencil class="size-3" /> Edit
      </button>
    {/if}
  </div>

  {#if destinations.length === 0}
    <p class="text-sm text-ink-muted">No destinations specified for this trip yet.</p>
  {:else}
    <div class="relative flex flex-col gap-3 pl-2">
      {#each destinations as dest, index (dest.id || index)}
        {@const flag = flagEmoji(dest.country)}
        {@const duration = calcDays(dest.arriveDate, dest.departDate)}
        <div class="relative flex items-start gap-3">
          <!-- Timeline connector line -->
          {#if index < destinations.length - 1}
            <div class="absolute left-[11px] top-6 bottom-0 w-0.5 bg-primary-200" aria-hidden="true"></div>
          {/if}

          <!-- Node circle -->
          <div class="z-10 mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary-600 text-[10px] font-bold text-white shadow-soft">
            {index + 1}
          </div>

          <div class="flex-1 min-w-0 rounded-lg border border-border/60 bg-surface p-2.5">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-ink truncate">
                {#if flag}<span aria-hidden="true">{flag}</span>{/if}
                {dest.name}
              </span>
              {#if duration}
                <span class="shrink-0 rounded bg-primary-100 px-1.5 py-0.5 text-[11px] font-semibold text-primary-800">
                  {duration}
                </span>
              {/if}
            </div>

            {#if dest.arriveDate || dest.departDate}
              <div class="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                <CalendarDays class="size-3 shrink-0" />
                <span>{formatDateRange(dest.arriveDate, dest.departDate)}</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</Card>
