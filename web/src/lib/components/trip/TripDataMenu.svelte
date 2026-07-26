<script lang="ts">
    import { syncStatus } from '$lib/db';
    import { ClipboardPaste, Download, FileDown, FileText, FileUp, MoreVertical, WifiOff } from 'lucide-svelte';
    import { Dialog, Popover, toast } from '$lib/components/ui';
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
    let busy = $state<'json' | 'pdf' | 'update' | 'paste' | null>(null);

    let fileInputRef = $state<HTMLInputElement | null>(null);
    let diffSheetOpen = $state(false);
    let currentDiff = $state<TripUpdateDiff | null>(null);

    let pasteDialogOpen = $state(false);
    let pasteText = $state('');
    let pasteError = $state('');

    const pasteJsonError = $derived.by(() => {
        const text = pasteText.trim();
        if (!text) return '';
        try {
            JSON.parse(text);
            return '';
        } catch (e: any) {
            return e?.message as string;
        }
    });

    async function pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            pasteText = text;
        } catch {
            // clipboard access denied — user can paste manually
        }
    }

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

    async function handlePasteUpdate() {
        const text = pasteText.trim();
        if (!text || pasteJsonError) {
            pasteError = 'Please paste valid JSON before continuing.';
            return;
        }
        busy = 'paste';
        try {
            const payload = JSON.parse(text);
            const diff = await prepareTripUpdateDiff(tripid, payload);
            currentDiff = diff;
            pasteDialogOpen = false;
            pasteText = '';
            diffSheetOpen = true;
        } catch (err: any) {
            pasteError = err?.message || 'Invalid JSON for trip update.';
        } finally {
            busy = null;
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
            {busy === 'update' ? 'Parsing JSON...' : 'Update from JSON file'}
        </button>
        <button
            type="button"
            class={itemClass}
            onclick={() => { pasteText = ''; pasteError = ''; pasteDialogOpen = true; open = false; }}
            disabled={!!busy}
        >
            <ClipboardPaste />
            {busy === 'paste' ? 'Parsing JSON...' : 'Paste JSON to update'}
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

<!-- Paste JSON dialog -->
<Dialog
    bind:open={pasteDialogOpen}
    title="Paste JSON to update"
    description="Paste an exported trip JSON below. You'll see a preview of what will change before anything is saved."
>
    <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
            {#if pasteText.trim()}
                <span class="text-xs font-medium {pasteJsonError ? 'text-destructive' : 'text-success'}">
                    {pasteJsonError ? 'Invalid JSON' : 'Valid JSON ✓'}
                </span>
            {:else}
                <span></span>
            {/if}
            <button
                type="button"
                onclick={pasteFromClipboard}
                class="text-xs font-medium text-primary-600 underline-offset-2 hover:underline"
            >
                Paste from clipboard
            </button>
        </div>

        <textarea
            value={pasteText}
            oninput={(e) => { pasteText = e.currentTarget.value; pasteError = ''; }}
            placeholder="Paste your exported trip JSON here…"
            rows="12"
            spellcheck="false"
            autocomplete="off"
            class="w-full rounded-md border border-border bg-surface font-mono text-xs text-ink placeholder:text-ink-muted/60 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30 transition-[box-shadow] p-3 resize-none {pasteText.trim() && pasteJsonError ? 'border-destructive ring-1 ring-destructive/30' : ''}"
        ></textarea>

        {#if pasteError}
            <p class="text-xs text-destructive">{pasteError}</p>
        {/if}
    </div>

    {#snippet footer()}
        <button
            type="button"
            onclick={() => (pasteDialogOpen = false)}
            class="rounded-md px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-sunken"
        >
            Cancel
        </button>
        <button
            type="button"
            onclick={handlePasteUpdate}
            disabled={!pasteText.trim() || !!pasteJsonError || busy === 'paste'}
            class="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
            {busy === 'paste' ? 'Parsing…' : 'Preview changes'}
        </button>
    {/snippet}
</Dialog>
