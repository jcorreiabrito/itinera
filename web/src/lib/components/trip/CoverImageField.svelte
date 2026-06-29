<script lang="ts" module>
</script>

<script lang="ts">
    import { attachments, fullTripid, trips } from '$lib/db';
    import { ImagePlus, Loader2, Trash2 } from 'lucide-svelte';
    import { Button, toast } from '$lib/components/ui';
    import TripCover from './TripCover.svelte';

    interface Props {
        /** Trip Id (bare ULID or full `trip:` form). */
        tripId: string;
        attId: string | null;
        title?: string;
        /** Fired after the cover changes so the parent can refresh. */
        onchange: (attId: string | null) => void;
    }

    let { tripId, attId = null, title = '', onchange }: Props = $props();

    let localAttId = $state<string | null>(null);
    let uploading = $state(false);
    let inputEl = $state<HTMLInputElement>();

    // Keep the preview in step with the prop (and any cover change we make).
    $effect(() => {
        localAttId = attId;
    });

    async function onFile(event: Event & { currentTarget: HTMLInputElement }) {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Please choose an image file for the cover.');
            event.currentTarget.value = '';
            return;
        }
        uploading = true;
        try {
            const att = await attachments.create({
                tripId,
                ownerType: 'trip',
                ownerId: fullTripid(tripId),
                file,
                resizeImages: true
            });
            await trips.setCover(tripId, att._id);
            localAttId = att._id;
            onchange(att._id);
            toast.success('Cover photo updated.');
        } catch {
            toast.error('Could not upload that image. Please try another.');
        } finally {
            uploading = false;
            if (inputEl) inputEl.value = '';
        }
    }

    async function removeCover() {
        uploading = true;
        try {
            await trips.setCover(tripId, null);
            localAttId = null;
            onchange(null);
        } catch {
            toast.error('Could not remove the cover photo.');
        } finally {
            uploading = false;
        }
    }
</script>

<div class="flex items-center gap-3">
    <div class="relative size-20 shrink-0 overflow-hidden rounded-md">
        <TripCover attId={localAttId} blob="thumb" {title} class="size-full" />
        {#if uploading}
            <div class="absolute inset-0 grid place-items-center bg-ink/40 text-white" aria-hidden="true">
                <Loader2 class="size-5 animate-spin" />
            </div>
        {/if}
    </div>

    <div class="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onclick={() => inputEl?.click()} disabled={uploading}>
            <ImagePlus class="size-4" />
            {localAttId ? 'Change photo' : 'Add photo'}
        </Button>
        {#if localAttId}
            <Button variant="ghost" size="sm" onclick={removeCover} disabled={uploading}>
                <Trash2 class="size-4" />
                Remove
            </Button>
        {/if}

        <input
            bind:this={inputEl}
            type="file"
            accept="image/*"
            class="hidden"
            aria-label="Upload cover photo"
            onchange={onFile}
        />
    </div>
</div>
