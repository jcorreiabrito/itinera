<script lang="ts">
    import type { Snippet } from 'svelte';
    import { attachments } from '$lib/db';
    import { gradientFromString } from '$lib/format';
    import { cn } from '$lib/utils';

    interface Props {
        attId?: string | null;
        /** Which stored blob to show ("thumb" on cards, "full" on the hero). */
        blob?: 'thumb' | 'full';
        /** Used for the deterministic gradient fallback + image alt text. */
        title?: string;
        alt?: string;
        class?: string;
        children?: Snippet;
    }

    let { attId = null, blob = 'thumb', title = '', alt, class: className, children }: Props = $props();

    let url = $state<string | null>(null);
    const gradient = $derived(gradientFromString(title || 'Itinera'));

    // Load the attachment bytes as a (view-safe) object URL, gating inline display
    // on the data layer's allowlist; revoke the URL when it changes / on destroy.
    $effect(() => {
        const id = attId;
        const name = blob;
        url = null;

        if (!id) return;

        let active = true;
        let created: string | null = null;

        (async () => {
            try {
                const att = await attachments.get(id);
                if (!active || !att) return;
                const mime = att.mime ?? '';
                if (!mime.startsWith('image/') || !attachments.isInlineRenderable(mime)) return;

                // Prefer the requested blob, but fall back to whatever this attachment
                // actually has (e.g. a single 'file' blob for small, un-resized covers).
                const picked = await attachments.pickBlobName(id, name);
                if (!picked) return;

                const objUrl = await attachments.objectUrl(id, picked);
                if (!active) {
                    if (objUrl) attachments.revokeObjectUrl(objUrl);
                    return;
                }
                created = objUrl;
                url = objUrl;
            } catch {
                /* fall back to the gradient */
            }
        })();

        return () => {
            active = false;
            if (created) attachments.revokeObjectUrl(created);
        };
    });
</script>

<div class={cn('relative overflow-hidden bg-surface-sunken', className)}>
    {#if url}
        <img src={url} alt={alt ?? title} class="size-full object-cover" loading="lazy" />
    {:else}
        <div class="size-full" style={`background-image:${gradient}`} aria-hidden="true"></div>
    {/if}
    {#if children}
        {@render children()}
    {/if}
</div>