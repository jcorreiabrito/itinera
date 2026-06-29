<script lang="ts" module>
    let nextId = 0;
</script>

<script lang="ts">
    import { attachments } from '$lib/db';
    import type { Attachment } from '$lib/db';
    import { Paperclip, Plus } from 'lucide-svelte';
    import { Button, toast } from '$lib/components/ui';
    import AttachmentThumb from './AttachmentThumb.svelte';
    import AttachmentViewer from './AttachmentViewer.svelte';

    interface Props {
        /** Bare trip ULID. */
        tripId: string;
        ownerType: 'trip' | 'flight' | 'reservation';
        /** Owner document id (must exist – attachments need an owner). */
        ownerId: string;
        /** Current attachments for this owner (from `listAttachments`). */
        items?: Attachment[];
        /** Link a freshly created attachment to the owner (e.g. `flights.linkAttachment`). */
        link: (attId: string) => Promise<unknown>;
        /** Unlink an attachment from the owner before it is removed. */
        unlink: (attId: string) => Promise<unknown>;
        onChange?: () => void;
        disabled?: boolean;
        accept?: string;
        label?: string;
    }

    let {
        tripId,
        ownerType,
        ownerId,
        items = [],
        link,
        unlink,
        onChange,
        disabled = false,
        accept = 'image/*,application/pdf',
        label = 'Attachments'
    }: Props = $props();

    const uid = ++nextId;
    let fileInput = $state<HTMLInputElement>();
    let uploading = $state(false);
    let viewerOpen = $state(false);
    let selected = $state<Attachment | null>(null);

    async function onFiles(event: Event & { currentTarget: HTMLInputElement }) {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = '';
        if (files.length === 0) return;
        uploading = true;
        try {
            for (const file of files) {
                // Images are client-resized by the data layer; bytes live offline.
                const att = await attachments.create({ tripId, ownerType, ownerId, file });
                await link(att._id);
            }
            onChange?.();
        } catch {
            toast.error('Could not add that file. Please try again.');
        } finally {
            uploading = false;
        }
    }

    function openViewer(att: Attachment) {
        selected = att;
        viewerOpen = true;
    }

    async function remove(att: Attachment) {
        try {
            await unlink(att._id);
            await attachments.remove(att._id);
            onChange?.();
        } catch {
            toast.error('Could not remove that file. Please try again.');
        }
    }
</script>

<div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-medium text-ink">{label}</span>
        <Button
            variant="secondary"
            size="sm"
            onclick={() => fileInput?.click()}
            {disabled}
            {disabled || uploading}
        >
            <Plus class="size-4" />
            {uploading ? 'Adding...' : 'Add file'}
        </Button>
    </div>

    <input
        bind:this={fileInput}
        id={`att-input-${uid}`}
        type="file"
        {accept}
        multiple
        class="sr-only"
        onchange={onFiles}
        aria-label={`Add ${label.toLowerCase()}`}
    />

    {#if items.length === 0}
        <p
            class="rounded-md border border-dashed border-border bg-surface-sunken px-3 py-4 text-center text-xs"
        >
            <Paperclip class="mx-auto mb-1 size-4" />
            No files yet. Boarding passes and vouchers are stored offline.
        </p>
    {:else}
        <ul class="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {#each items as att (att._id)}
                <li class="aspect-square">
                    <AttachmentThumb
                        attachment={att}
                        onopen={() => openViewer(att)}
                        onremove={() => remove(att)}
                        class="size-full"
                    />
                </li>
            {/each}
        </ul>
    {/if}
</div>

<AttachmentViewer bind:open={viewerOpen} attachment={selected} />