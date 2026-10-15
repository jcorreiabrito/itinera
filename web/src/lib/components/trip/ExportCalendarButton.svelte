<script lang="ts">
  import type { Trip, ItineraryItem } from '$lib/db';
  import { downloadTripICS } from '$lib/utils/ics';
  import { toast } from '$lib/components/ui';
  import { Calendar, Download, Link2 } from 'lucide-svelte';

  let { trip, items = [] }: { trip: Trip; items?: ItineraryItem[] } = $props();
  let menuOpen = $state(false);

  function handleExportFile() {
    menuOpen = false;
    try {
      downloadTripICS(trip, items);
      toast.success('Calendário (.ics) baixado!');
    } catch (err) {
      console.error('Failed to export calendar', err);
      toast.error('Erro ao baixar calendário');
    }
  }

  async function handleCopyFeed() {
    menuOpen = false;
    try {
      const origin = window.location.origin;
      const feedUrl = `${origin}/api/trips/${trip._id}/calendar.ics`;
      await navigator.clipboard.writeText(feedUrl);
      toast.success('Link do calendário copiado! Adicione no Google/Apple Calendar para sincronizar.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  }
</script>

<div class="relative inline-block text-left">
  <button
    type="button"
    onclick={() => (menuOpen = !menuOpen)}
    class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-surface text-ink border border-border hover:bg-surface-sunken transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 shadow-soft"
    title="Opções de calendário"
    aria-label="Opções de calendário"
  >
    <Calendar class="size-4 text-primary-600" />
    <span>Calendário</span>
  </button>

  {#if menuOpen}
    <!-- Backdrop to close dropdown on outer click -->
    <div
      class="fixed inset-0 z-40"
      onclick={() => (menuOpen = false)}
      onkeydown={(e) => e.key === 'Escape' && (menuOpen = false)}
      role="presentation"
    ></div>

    <div
      class="absolute right-0 z-50 mt-1 w-56 origin-top-right rounded-lg border border-border bg-surface p-1 shadow-card text-xs divide-y divide-border/50"
    >
      <button
        type="button"
        onclick={handleExportFile}
        class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-ink hover:bg-surface-sunken transition-colors"
      >
        <Download class="size-4 text-primary-600 shrink-0" />
        <div>
          <div class="font-medium text-ink">Baixar arquivo .ics</div>
          <div class="text-[10px] text-ink-muted">Importação manual offline</div>
        </div>
      </button>

      <button
        type="button"
        onclick={handleCopyFeed}
        class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-ink hover:bg-surface-sunken transition-colors"
      >
        <Link2 class="size-4 text-primary-600 shrink-0" />
        <div>
          <div class="font-medium text-ink">Assinar calendário (Ao vivo)</div>
          <div class="text-[10px] text-ink-muted">Sincroniza no Google/Apple Cal</div>
        </div>
      </button>
    </div>
  {/if}
</div>
