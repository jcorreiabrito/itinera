<script lang="ts">
    import { attachments } from '$lib/db';
    import type { Attachment } from '$lib/db';
    import { Download, ExternalLink, FileWarning } from 'lucide-svelte';
    import { Button, Dialog } from '$lib/components/ui';

    interface Props {
        attachment: Attachment | null;
        open?: boolean;
        onclose: () => void;
    }

    let { attachment = null, open = $bindable(false), onclose }: Props = $props();

    const mime = $derived(attachment?.mime ?? '');
    const essence = $derived(mime.split(';', 1)[0].trim().toLowerCase());
    // SECURITY: every inline-render decision is gated on the data layer's
    // allowlist. Rasters -> <img>; PDF -> download/open + sandboxed (script-less)
    // iframe; everything else (svg/html/unknown + octet-stream) is download-only.
    const inline = $derived(attachment ? attachments.isInlineRenderable(mime) : false);
    const isImage = $derived(inline && essence.startsWith('image/'));
    const isPdf = $derived(inline && essence === 'application/pdf');
    const name = $derived(attachment?.filename ?? 'Attachment');

    let url = $state<string | null>(null);

    // Object URLs are served with a view-safe MIME by the data layer; we still
    // only ever wire them into the elements allowed for the attachment's type.
    $effect(() => {
        const att = attachment;
        if (!att || !open) {
            url = null;
            return;
        }
        let active = true;
        let made: string | null = null;
        ;(async () => {
            try {
                const blob = await attachments.pickBlobName(att._id, isImage ? 'full' : 'file');
                const u = await attachments.objectUrl(att._id, blob ?? undefined);
                if (!active) {
                    if (u) attachments.revokeObjectUrl(u);
                    return;
                }
                made = u;
                url = u;
            } catch {
                url = null;
            }
        })();
        return () => {
            active = false;
            if (made) attachments.revokeObjectUrl(made);
            url = null;
        };
    });
</script>

<Dialog bind:open title={name} class="w-[min(94vw,48rem)]" {onclose}>
    {#if attachment}
        {#if isImage}
            {#if url}
                <img src={url} alt={name} class="mx-auto max-h-[68vh] w-auto rounded-md object-contain" />
                <div class="mt-4 flex justify-center">
                    <Button href={url} download={name} variant="secondary">
                        <Download class="size-4" /> Download
                    </Button>
                </div>
            {:else}
                <p class="py-10 text-center text-sm text-ink-muted">Loading...</p>
            {/if}
        {:else if isPdf}
            {#if url}
                <div class="flex flex-wrap items-center gap-2">
                    <Button href={url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink class="size-4" /> Open in new tab
                    </Button>
                    <Button href={url} download={name} variant="secondary">
                        <Download class="size-4" /> Download
                    </Button>
                </div>
                <!-- Sandboxed with NO allow-scripts / allow-same-origin: the embedded
                document cannot run script or reach the app origin. -->
                <iframe
                    src={url}
                    title={`Preview of ${name}`}
                    sandbox=""
                    class="mt-3 h-[60vh] w-full rounded-md border border-border bg-surface-sunken"
                ></iframe>
            {:else}
                <p class="py-10 text-center text-sm text-ink-muted">Loading...</p>
            {/if}
        {:else}
            <!-- Download-only: not on the inline allowlist. Never rendered inline. -->
            <div class="flex flex-col items-center gap-3 py-8 text-center">
                <span class="grid size-14 place-items-center rounded-full bg-warning/10 text-warning [&_svg]:size-8">
                    <FileWarning />
                </span>
                <p class="max-w-sm text-pretty text-sm text-ink-muted">
                    This file type can't be previewed safely. Download it to open in another app.
                </p>
                {#if url}
                    <Button href={url} download={name} variant="secondary">
                        <Download class="size-4" /> Download {name}
                    </Button>
                {/if}
            </div>
        {/if}
    {/if}
</Dialog>