<script lang="ts">
  import { onMount } from 'svelte';
  import { trash } from '$lib/db';
  import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-svelte';
  import {
    Badge,
    Button,
    Checkbox,
    Dialog,
    EmptyState,
    Skeleton,
    SyncStatusPill,
    toast
  } from '$lib/components/ui';
  import { relativeTime } from '$lib/format';
  import { startLive } from '$lib/live';

  type Entry = Awaited<ReturnType<typeof trash.list>>[number];

  let loaded = $state(false);
  let entries = $state<Entry[]>([]);
  let selected = $state<Record<string, boolean>>({});
  let working = $state(false);

  // Confirmation for destructive purges.
  let confirm = $state<{ kind: 'one' | 'many' | 'all'; ids: string[]; label?: string } | null>(null);

  async function load() {
    try {
      entries = await trash.list();
      // Drop selection entries that no longer exist.
      const present = new Set(entries.map((e) => e.id));
      selected = Object.fromEntries(
        Object.entries(selected).filter(([id, on]) => on && present.has(id))
      );
    } catch {
      toast.error('Could not load Trash.');
    } finally {
      loaded = true;
    }
  }

  onMount(() => {
    load();
    return startLive(load);
  });

  const TYPE_LABELS: Record<string, string> = {
    trip: 'Trips',
    tripDay: 'Itinerary days',
    itineraryItem: 'Itinerary items',
    checklistItem: 'Checklist items',
    checklistTemplate: 'Checklist templates',
    flight: 'Flight bookings',
    reservation: 'Reservations',
    expense: 'Expenses',
    attachment: 'Attachments'
  };

  const TYPE_ORDER = Object.keys(TYPE_LABELS);

  function groupLabel(type: string): string {
    return TYPE_LABELS[type ?? ''] ?? 'Other';
  }

  const groups = $derived.by(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const key = e.type ?? 'other';
      (map.get(key) ?? map.set(key, []).get(key)!).push(e);
    }
    return [...map.entries()].sort(([a], [b]) => {
      const ra = TYPE_ORDER.indexOf(a);
      const rb = TYPE_ORDER.indexOf(b);
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    });
  });

  const selectedIds = $derived(Object.keys(selected).filter((id) => selected[id]));
  const selectedCount = $derived(selectedIds.length);

  function toggle(id: string, on: boolean) {
    selected = { ...selected, [id]: on };
  }

  async function restore(ids: string[]) {
    if (!ids.length) return;
    working = true;
    try {
      await trash.restoreMany(ids);
      toast.success(ids.length === 1 ? 'Restored.' : `Restored ${ids.length} items.`);
      selected = {};
      await load();
    } catch {
      toast.error('Could not restore. Try again.');
    } finally {
      working = false;
    }
  }

  function askPurge(kind: 'one' | 'many' | 'all', ids: string[], label?: string) {
    confirm = { kind, ids, label };
  }

  async function doPurge() {
    if (!confirm) return;
    const { kind, ids } = confirm;
    confirm = null;
    working = true;
    try {
      if (kind === 'all') {
        const n = await trash.empty();
        toast.success(n ? `Permanently deleted ${n} items.` : 'Trash is already empty.');
      } else {
        await trash.purgeMany(ids);
        toast.success(ids.length === 1 ? 'Permanently deleted.' : `Permanently deleted ${ids.length} items.`);
      }
      selected = {};
      await load();
    } catch {
      toast.error('Could not delete. Try again.');
    } finally {
      working = false;
    }
  }

  const confirmTitle = $derived(
    confirm?.kind === 'all'
      ? 'Empty Trash'
      : confirm?.kind === 'many'
        ? `Delete ${confirm.ids.length} items forever?`
        : 'Delete forever?'
  );
</script>

<svelte:head>
  <title>Trash – Itinera</title>
</svelte:head>

<header class="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
  <div class="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
    <div class="flex items-center gap-2">
      <a
        href="/settings"
        aria-label="Back to settings"
        class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [&_svg]:size-5"
      >
        <ArrowLeft />
      </a>
      <h1 class="font-serif text-xl font-semibold">Trash</h1>
    </div>
    <SyncStatusPill />
  </div>
</header>

<main class="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
  <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm text-ink-muted">
      Deleted items wait here. Restore them, or purge to remove permanently. Purging syncs to all
      your devices.
    </p>
    {#if entries.length > 0}
      <Button
        variant="ghost"
        size="sm"
        class="text-darker hover:bg-danger/10"
        onclick={() => askPurge('all', entries.map((e) => e.id))}
        disabled={working}
      >
        <Trash2 class="size-4" /> Empty Trash
      </Button>
    {/if}
  </div>

  {#if !loaded}
    <div class="space-y-4">
      <Skeleton class="h-18 w-48 rounded-lg" />
      <Skeleton class="h-16 w-full rounded-lg" />
      <Skeleton class="h-16 w-full rounded-lg" />
    </div>
  {:else if entries.length === 0}
    <EmptyState
      icon={Trash2}
      title="Trash is empty."
      description="When you delete a trip or items, it lands here so you can undo. Nothing's waiting right now."
    />
  {:else}
    <div class="space-y-6">
      {#each groups as [type, items] (type)}
        <section aria-label={groupLabel(type)}>
          <h2 class="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-muted">
            {groupLabel(type)}
            <Badge variant="neutral">{items.length}</Badge>
          </h2>
          <ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {#each items as entry (entry.id)}
              <li class="flex items-center gap-2 px-3 py-2.5">
                <Checkbox
                  class="min-w-0 flex-1"
                  label={entry.label}
                  description={entry.deletedAt ? `Deleted ${relativeTime(entry.deletedAt)}` : 'Deleted'}
                  checked={selected[entry.id]}
                  onchange={(e) => toggle(entry.id, e.currentTarget.checked)}
                />
                <Button variant="ghost" size="sm" onclick={() => restore([entry.id])} disabled={working}>
                  <RotateCcw class="size-4" /> Restore
                </Button>
                <Button
                  type="button"
                  onclick={() => askPurge('one', [entry.id], entry.label)}
                  disabled={working}
                  aria-label="Delete {entry.label} forever"
                >
                  <Trash2 class="size-9 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-danger/10 hover:text-darker disabled:opacity-40 [&_svg]:size-4" />
                </Button>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}

  {#if selectedCount > 0}
    <!-- Sticky selection action bar -->
    <div class="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md">
      <div class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <span class="text-sm font-medium text-ink">{selectedCount} selected</span>
        <div class="flex items-center gap-2">
          <Button variant="secondary" size="sm" onclick={() => restore(selectedIds)} disabled={working}>
            <RotateCcw class="size-4" /> Restore
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onclick={() => askPurge('many', selectedIds)}
            disabled={working}
          >
            <Trash2 class="size-4" /> Delete forever
          </Button>
        </div>
      </div>
    </div>
  {/if}

  <Dialog
    open={confirm != null}
    title={confirmTitle}
    description="This permanently removes the data and can't be undone."
    onclose={() => (confirm = null)}
  >
    {#if confirm?.kind === 'one' && confirm.label}
      <p class="text-sm text-ink-muted">"{confirm.label}" will be gone for good.</p>
    {:else}
      <p class="text-sm text-ink-muted">The selected items will be gone for good on every device.</p>
    {/if}
    {#snippet footer()}
      <Button variant="ghost" onclick={() => (confirm = null)}>Cancel</Button>
      <Button variant="destructive" onclick={doPurge}>Delete forever</Button>
    {/snippet}
  </Dialog>
</main>
