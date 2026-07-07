<script lang="ts">
    import { syncStatus } from '$lib/db';
    import { Download, FileDown, FileText, MoreVertical, WifiOff } from 'lucide-svelte';
    import { Popover, toast } from '$lib/components/ui';
    import { downloadTripExport, downloadTripPdf } from '$lib/api';
    import { cn } from '$lib/utils';

    interface Props {
        /** Bare trip UUID. */
        tripid: string;
        title?: string;
    }

    let { tripid, title } = $props();

    let open = $state(false);
    let busy = $state<'json' | 'pdf' | null>(null);

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

    const itemClass =
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-sunken disabled:opacity-40';
</script>

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

        {#if !online}
            <p
                class={cn(
                    'mt-1 flex items-start gap-1.5 rounded-md bg-surface-sunken px-2.5 py-2 text-xs text-ink-muted',
                    '& svg}:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0',
                )}
            >
                <WifiOff />
                <span>Needs connection – these run on your home server.</span>
            </p>
        {:else}
            <p class="mt-1 flex items-center gap-1.5 px-2.5 py-1 text-[0.7rem] text-ink-muted">
                <Download class="size-3" /> Saved to your device.
            </p>
        {/if}
    </div>
</Popover>
