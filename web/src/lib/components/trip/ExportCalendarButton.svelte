<script lang="ts">
  import type { Trip, ItineraryItem } from '$lib/db';
  import { downloadTripICS } from '$lib/utils/ics';
  import { toast } from '$lib/components/ui';

  let { trip, items = [] }: { trip: Trip; items?: ItineraryItem[] } = $props();

  function handleExport() {
    try {
      downloadTripICS(trip, items);
      toast.success('Calendar (.ics) downloaded!');
    } catch (err) {
      console.error('Failed to export calendar', err);
      toast.error('Failed to export calendar');
    }
  }
</script>

<button
  type="button"
  onclick={handleExport}
  class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-surface text-ink border border-border hover:bg-surface-sunken transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
  title="Export trip to calendar (.ics)"
  aria-label="Export trip to calendar (.ics)"
>
  <svg class="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
  <span>Calendar (.ics)</span>
</button>
