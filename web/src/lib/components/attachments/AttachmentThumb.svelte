<script lang="ts">
    import { attachments } from '$lib/db';
    import type { Attachment } from '$lib/db';
    import { FileText, Image as ImageIcon, X } from 'lucide-svelte';
    import { cn } from '$lib/utils';

    interface Props {
        attachment: Attachment;
        /** Show the remove (×) affordance. */
        removable?: boolean;
        onopen?: () => void;
        onremove?: () => void;
        class?: string;
    }

    let { attachment, removable = true, onopen, onremove, class: className }: Props = $props();

    const mime = $derived(attachment.mime ?? '');
    // Only inline-allowlisted raster types get an <img> thumbnail; everything else
    // (incl. PDF and coerced svg/html) shows an inert file chip. Gating on
    // `isInlineRenderable` mirrors the viewer's security contract.
    const isImage = $derived(attachments.isInlineRenderable(mime) && mime.startsWith('image/'));
    const isPdf = $derived(mime.split(';', 1)[0].toLowerCase() === 'application/pdf');
    const name = $derived(attachment.filename ?? 'Attachment');

    let url = $state<string | null>(null);

    // Load the (already-resized) thumbnail blob as an object URL for offline view,
    // revoking it whenever the attachment changes or the file is destroyed.
    $effect(() => {
        const id = attachment._id;
        if (!isImage) {
            url = null;
            return;
        }
        let active = true;
        let made: string | null = null;
        ;(async () => {
            try {
                const blob = await attachments.pickBlobName(id, 'thumb');
                const u = await attachments.objectUrl(id, blob ?? undefined);
                if (!active) {
                    if (u) attachments.revokeObjectUrl(u);
                    return;
                }
                made = u;
                url = u;
            } catch {
                /* leave url null -> falls back to the file chip */
            }
        })();
        return () => {
            active = false;
            if (made) attachments.revokeObjectUrl(made);
            url = null;
        };
    });
</script>

<div class={cn('group relative', className)}>
    <button
        type="button"
        onclick={onopen}
        aria-label={`View ${name}`}
        class="block size-full overflow-hidden rounded-md border border-border bg-surface-sunken text-left transition-all hover:shadow-sm"
    >
        {#if isImage && url}
            <img src={url} alt={name} class="size-full object-cover" />
        {:else}
            <span
                class="flex size-full flex-col items-center justify-center gap-1 p-2 text-center [&_svg]:size-6"
            >
                {#if isImage}
                    <ImageIcon class="text-ink-muted" />
                {:else}
                    <FileText class="text-ink-muted" />
                {/if}
                <span class="line-clamp-2 break-all text-[0.65rem] font-medium text-ink-muted">
                    {isPdf ? 'PDF' : name}
                </span>
            </span>
        {/if}
    </button>

    {#if removable}
        <button
            type="button"
            onclick={onremove}
            aria-label={`Remove ${name}`}
            class="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-border bg-surface text-ink-muted hover:bg-surface-sunken"
        >
            <X />
        </button>
    {/if}
</div>
