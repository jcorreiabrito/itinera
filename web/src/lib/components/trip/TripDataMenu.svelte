<script lang="ts">
    import { syncStatus } from '$lib/db';
    import { Download, FileDown, FileText, FileUp, MoreVertical, WifiOff } from 'lucide-svelte';
    import { Popover, toast } from '$lib/components/ui';
    import { downloadTripExport, downloadTripPdf } from '$lib/api';
    import { prepareTripUpdateDiff, executeTripUpdate, type TripUpdateDiff } from '$lib/db/importer';
    import { cn } from '$lib/utils';
    import UpdateDiffSheet from './UpdateDiffSheet.svelte';

    interface Props {
        /** Bare trip UUID or full trip ID. */
        tripid: string;
        title?: string;
    }

    let { tripid, title }: Props = $props();

    let open = $state(false);
    let busy = $state<'json' | 'pdf' | 'update' | null>(null);

    let fileInputRef = $state<HTMLInputElement | null>(null);
    let diffSheetOpen = $state(false);
    let currentDiff = $state<TripUpdateDiff | null>(null);

    // `navigator.online` is not reactive, so mirror it via the online/offline
    // events; combine with the sync store (doc 85) for the gentle gate.
    let navOnline = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
    $effect(() => {
        const up = () => (navOnline = true);
        const down = () => (navOnline = false);
        window.addEventListener('online', up);
        window.addEventListener('offline', down);
        return () => {
            window.removeEventListener('online', up);
            window.removeEventListener('offline', down);
        };
    });

    const online = $derived(navOnline && $syncStatus.state !== 'offline' && $syncStatus.state !== 'error');

    async function exportJson() {
        if (!online || busy) return;
        busy = 'json';
        try {
            await downloadTripExport(tripid);
            toast.success('Trip JSON exported.');
            open = false;
        } catch {
            toast.error('Could not export – is your home server reachable?', {
                action: { label: 'Retry', onClick: exportJson }
            });
        } finally {
            busy = null;
        }
    }

    async function exportPdf() {
        if (!online || busy) return;
        busy = 'pdf';
        try {
            await downloadTripPdf(tripid);
            toast.success('Printable PDF ready.');
            open = false;
        } catch {
            toast.error('Could not build the PDF – is your home server reachable?', {
                action: { label: 'Retry', onClick: exportPdf }
            });
        } finally {
            busy = null;
        }
    }

    function triggerUpdateFile() {
        fileInputRef?.click();
    }

    async function handleFileSelect(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        busy = 'update';
        try {
            const text = await file.text();
            const payload = JSON.parse(text);
            const diff = await prepareTripUpdateDiff(tripid, payload);
            currentDiff = diff;
            open = false;
            diffSheetOpen = true;
        } catch (err: any) {
            toast.error(err?.message || 'Invalid JSON file for trip update.');
        } finally {
            busy = null;
            if (input) input.value = '';
        }
    }

    async function confirmUpdate() {
        if (!currentDiff) return;
        try {
            await executeTripUpdate(currentDiff.readyToSaveDocs);
            toast.success('Trip updated successfully from JSON.');
            setTimeout(() => {
                window.location.reload();
            }, 300);
        } catch (err: any) {
            toast.error(err?.message || 'Could not update trip.');
        }
    }

    const itemClass =
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-sunken disabled:opacity-40';
</script>

<input
    type="file"
    accept=".json,application/json"
    class="hidden"
    bind:this={fileInputRef}
    onchange={handleFileSelect}
/>

<UpdateDiffSheet
    bind:open={diffSheetOpen}
    diff={currentDiff}
    onconfirm={confirmUpdate}
/>

<Popover bind:open align="end" label="Trip data and exports">
    {#snippet trigger({ toggle, open: isOpen })}
        <button
            type="button"
            onclick={toggle}
            aria-haspopup="true"
            aria-expanded={isOpen}
            aria-label="Trip data and exports"
            class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
        >
            <MoreVertical />
        </button>
    {/snippet}

    <div class="w-60 p-1">
        <p class="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted/80">
            Export {title ? `"${title}"` : 'this trip'}
        </p>

        <button type="button" class={itemClass} onclick={exportJson} disabled={!online || !!busy}>
            <FileDown />
            {busy === 'json' ? 'Exporting...' : 'Export JSON'}
        </button>
        <button type="button" class={itemClass} onclick={exportPdf} disabled={!online || !!busy}>
            <FileText />
            {busy === 'pdf' ? 'Preparing...' : 'Printable PDF'}
        </button>

        <div class="my-1 border-t border-border"></div>

        <p class="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted/80">
            Update
        </p>

        <button type="button" class={itemClass} onclick={triggerUpdateFile} disabled={!!busy}>
            <FileUp />
            {busy === 'update' ? 'Parsing JSON...' : 'Update from JSON'}
        </button>

        {#if !online}
            <p
                class={cn(
                    'mt-1 flex items-start gap-1.5 rounded-md bg-surface-sunken px-2.5 py-2 text-xs text-ink-muted',
                    '&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0',
                )}
            >
                <WifiOff />
                <span>Exports need server connection. JSON Update works offline.</span>
            </p>
        {:else}
            <p class="mt-1 flex items-center gap-1.5 px-2.5 py-1 text-[0.7rem] text-ink-muted">
                <Download class="size-3" /> Saved to your device.
            </p>
        {/if}
    </div>
</Popover>
