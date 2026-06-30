<script lang="ts">
    import { listConflicts, syncNow, syncStatus } from '$lib/db';
    import { Check, CloudOff, GitMerge, RefreshCw, TriangleAlert, UploadCloud } from 'lucide-svelte';
    import { cn } from '$lib/utils';
    import { relativeTime } from '$lib/format';
    import Popover from './Popover.svelte';
    import Button from './Button.svelte';

    interface Props {
        class?: string;
    }

    let { class: className }: Props = $props();

    let open = $state(false);
    let conflicts = $state<Awaited<ReturnType<typeof listConflicts>>>([]);
    let conflictsLoaded = $state(false);
    let syncing = $state(false);

    type State = 'synced' | 'syncing' | 'offline' | 'pending' | 'error';

    const config: Record<State, { label: string; tone: string }> = {
        synced: { label: 'Synced', tone: 'border-primary-100 bg-primary-100 text-success' },
        syncing: { label: 'Syncing...', tone: 'border-info/20 bg-info/10 text-info' },
        pending: { label: 'Pending', tone: 'border-warning/20 bg-warning/10 text-warning' },
        offline: { label: 'Offline', tone: 'border-border bg-surface-sunken text-ink-muted' },
        error: { label: 'Sync error', tone: 'border-danger/20 bg-danger/10 text-danger' },
    };

    const current = $derived(config[$syncStatus.state]);

    async function refreshConflicts() {
        try {
            conflicts = await listConflicts();
        } catch {
            conflicts = [];
        }
        conflictsLoaded = true;
    }

    $effect(() => {
        if (open && !conflictsLoaded) refreshConflicts();
    });

    async function doSyncNow() {
        syncing = true;
        try {
            await syncNow();
            // the error is reflected in the sync status store
        } catch {
            // ignore (the error is reflected in the sync status store)
        } finally {
            syncing = false;
            await refreshConflicts();
        }
    }
</script>

<Popover bind:open align="end" label="Sync status and options" class={className}>
    {#snippet trigger({ toggle, open: isOpen })}
        <button
            type="button"
            onclick={toggle}
            aria-haspopup="true"
            aria-expanded={isOpen}
            aria-label="Sync status: {$syncStatus.state}. Show details."
            class="relative inline-flex items-center gap-1.5 rounded-full glass-panel px-2.5 py-1 text-xs font-medium transition-colors hover:brightness-90 focus:visible:outline-none focus:visible:ring-2 focus:visible:ring-primary-600 focus:visible:ring-offset-2 focus:visible:ring-offset-bg"
        >
            {#if $syncStatus.state === 'synced'}
                <Check class="size-3.5" />
            {:else if $syncStatus.state === 'syncing'}
                <RefreshCw class="size-3.5 animate-spin" />
            {:else if $syncStatus.state === 'pending'}
                <UploadCloud class="size-3.5" />
            {:else if $syncStatus.state === 'error'}
                <TriangleAlert class="size-3.5" />
            {:else}
                <CloudOff class="size-3.5" />
            {/if}
            <span aria-label={current.label}>{current.label}</span>
            {#if $syncStatus.state === 'pending' && $syncStatus.pendingChanges}
                <span class="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-warning ring-1 ring-bg" aria-hidden="true"></span>
            {/if}
        </button>
    {/snippet}

    <div class="w-64 p-2">
        <div class="flex items-center justify-between gap-2 px-1">
            <span class="text-sm font-semibold text-ink">{current.label}</span>
            {#if $syncStatus.pendingChanges}
                <span class="text-xs text-warning">Unsynced changes</span>
            {/if}
        </div>

        <p class="mt-0.5 px-1 text-xs text-ink-muted">
            {#if $syncStatus.lastSyncedAt}
                Last synced {relativeTime($syncStatus.lastSyncedAt)}
            {:else}
                Not yet synced
            {/if}
        </p>

        {#if $syncStatus.state === 'error' && $syncStatus.error}
            <p class="mt-1 line-clamp-2 rounded-md bg-danger/10 px-2 py-1 text-xs text-danger">
                {$syncStatus.error}
            </p>
        {/if}

        <div class="mt-2">
            <Button
                variant="secondary"
                size="sm"
                class="w-full"
                onclick={doSyncNow}
                disabled={syncing || $syncStatus.state === 'syncing'}
            >
                <RefreshCw class={cn('size-4', (syncing || $syncStatus.state === 'syncing') && 'animate-spin')} />
                {syncing || $syncStatus.state === 'syncing' ? 'Syncing...' : 'Sync now'}
            </Button>
        </div>

        <div class="mt-3 border-t border-border px-1 pt-2">
            {#if conflictsLoaded}
                <div class="flex items-center gap-1.5 text-xs text-ink-muted">
                    <GitMerge class="size-3.5" /> {conflicts.length} conflicts
                </div>
                <p class="flex items-center gap-1.5 text-xs text-ink-muted">
                    <GitMerge class="size-3.5" /> No conflicts – everything converged.
                </p>
            {:else}
                <a
                    href="/settings/conflicts"
                    onclick={() => { open = false; }}
                    class="flex items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken"
                >
                    <span class="flex items-center gap-1.5">
                        <GitMerge class="size-3.5 text-primary-700" /> Review changes
                    </span>
                    <span
                        class="rounded-full bg-primary-100 px-1.5 py-0.5 text-[0.7rem] font-semibold text-primary-700"
                    >
                        {conflicts.length}
                    </span>
                </a>
            {/if}
        </div>
    </div>
</Popover>
