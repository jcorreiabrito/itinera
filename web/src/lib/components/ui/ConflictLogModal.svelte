<script lang="ts">
  import { onMount } from 'svelte';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';
  import { listConflicts, markConflictReviewed } from '$lib/db/sync';
  import { toast } from './toast';

  let { open = $bindable(false) }: { open: boolean } = $props();

  let conflicts = $state<Array<{ id: string; winner: any; losers: any[] }>>([]);
  let loading = $state(false);

  async function loadConflicts() {
    loading = true;
    try {
      conflicts = await listConflicts();
    } catch (err) {
      console.error('Failed to load conflicts', err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (open) {
      loadConflicts();
    }
  });

  async function handleDismiss(id: string) {
    try {
      await markConflictReviewed(id);
      conflicts = conflicts.filter((c) => c.id !== id);
      toast.success('Conflict marked as reviewed');
    } catch (err) {
      toast.error('Failed to dismiss conflict');
    }
  }
</script>

<Dialog bind:open title="Sync Conflict Log">
  <div class="space-y-4">
    <p class="text-sm text-ink-muted">
      Itinera resolves sync conflicts automatically using last-write-wins. Older or overwritten changes from other devices are safely preserved here for your review.
    </p>

    {#if loading}
      <div class="py-8 text-center text-sm text-ink-muted">Loading conflict history...</div>
    {:else if conflicts.length === 0}
      <div class="py-8 text-center text-sm text-ink-muted border border-dashed border-border rounded-lg">
        No unresolved or unreviewed sync conflicts.
      </div>
    {:else}
      <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {#each conflicts as item (item.id)}
          <div class="rounded-lg border border-border bg-surface p-3 space-y-2 text-sm">
            <div class="flex items-center justify-between font-medium text-ink">
              <span class="truncate font-mono text-xs text-primary-700">{item.id}</span>
              <span class="text-xs text-ink-muted">{item.losers.length} superseded version(s)</span>
            </div>

            <div class="bg-surface-sunken p-2 rounded text-xs space-y-1">
              <div class="font-semibold text-ink">Kept Version (Winner):</div>
              <pre class="overflow-x-auto text-[11px] font-mono text-ink-muted">{JSON.stringify(item.winner, null, 2)}</pre>
            </div>

            <div class="flex justify-end">
              <Button size="sm" variant="ghost" onclick={() => handleDismiss(item.id)}>
                Dismiss / Mark Reviewed
              </Button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</Dialog>
