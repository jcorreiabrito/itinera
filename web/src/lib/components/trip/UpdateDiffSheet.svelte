<script lang="ts">
    import { Sheet, Button } from '$lib/components/ui';
    import type { TripUpdateDiff } from '$lib/db/importer';
    import { PlusCircle, Edit3, Trash2, CheckCircle2 } from 'lucide-svelte';

    interface Props {
        open?: boolean;
        diff?: TripUpdateDiff | null;
        onconfirm?: () => Promise<void> | void;
    }

    let { open = $bindable(false), diff = null, onconfirm }: Props = $props();

    let saving = $state(false);

    function getItemLabel(doc: any): string {
        if (doc.type === 'trip') return `Trip: ${doc.title || 'Untitled'}`;
        if (doc.type === 'tripDay') return `Day: ${doc.date || doc.title || 'Day'}`;
        if (doc.type === 'itineraryItem') return `Activity: ${doc.title || 'Untitled'}`;
        if (doc.type === 'flight') {
            const seg = doc.segments?.[0];
            return `Flight: ${seg ? `${seg.from?.code || ''} -> ${seg.to?.code || ''}` : 'Flight'}`;
        }
        if (doc.type === 'reservation') return `Reservation: ${doc.name || 'Booking'}`;
        if (doc.type === 'expense') return `Expense: ${doc.description || doc.category || 'Expense'}`;
        if (doc.type === 'checklistItem') return `Checklist: ${doc.text || 'Item'}`;
        return `${doc.type || 'Document'}`;
    }

    async function handleConfirm() {
        if (!onconfirm) return;
        saving = true;
        try {
            await onconfirm();
            open = false;
        } finally {
            saving = false;
        }
    }
</script>

<Sheet
    bind:open
    side="right"
    title="Review JSON Changes"
    description="Review what will be changed in your trip before confirming."
>
    {#if !diff}
        <div class="p-4 text-center text-sm text-ink-muted">No diff available.</div>
    {:else if diff.isNoOp}
        <div class="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <CheckCircle2 class="size-10 text-emerald-500" />
            <p class="font-medium text-ink">No changes detected</p>
            <p class="text-xs text-ink-muted">
                The JSON file is identical to your current trip data.
            </p>
        </div>
    {:else}
        <div class="flex flex-col gap-5 py-2">
            <!-- Added Section -->
            {#if diff.added.length > 0}
                <div class="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                    <div class="flex items-center gap-2 font-semibold text-emerald-800 text-sm">
                        <PlusCircle class="size-4 text-emerald-600" />
                        <span>To Add ({diff.added.length})</span>
                    </div>
                    <ul class="flex flex-col gap-1.5 pl-6 text-xs text-emerald-950">
                        {#each diff.added as item (item._id)}
                            <li class="list-disc">{getItemLabel(item)}</li>
                        {/each}
                    </ul>
                </div>
            {/if}

            <!-- Updated Section -->
            {#if diff.updated.length > 0}
                <div class="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                    <div class="flex items-center gap-2 font-semibold text-amber-800 text-sm">
                        <Edit3 class="size-4 text-amber-600" />
                        <span>To Update ({diff.updated.length})</span>
                    </div>
                    <ul class="flex flex-col gap-1.5 pl-6 text-xs text-amber-950">
                        {#each diff.updated as item (item._id)}
                            <li class="list-disc">{getItemLabel(item)}</li>
                        {/each}
                    </ul>
                </div>
            {/if}

            <!-- Removed Section -->
            {#if diff.removed.length > 0}
                <div class="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
                    <div class="flex items-center gap-2 font-semibold text-rose-800 text-sm">
                        <Trash2 class="size-4 text-rose-600" />
                        <span>To Remove ({diff.removed.length})</span>
                    </div>
                    <p class="text-[0.7rem] text-rose-700">
                        Items missing in your JSON will be moved to Trash.
                    </p>
                    <ul class="flex flex-col gap-1.5 pl-6 text-xs text-rose-950">
                        {#each diff.removed as item (item._id)}
                            <li class="list-disc">{getItemLabel(item)}</li>
                        {/each}
                    </ul>
                </div>
            {/if}
        </div>
    {/if}

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)} disabled={saving}>Cancel</Button>
        <Button onclick={handleConfirm} disabled={!diff || diff.isNoOp || saving}>
            {saving ? 'Updating...' : 'Confirm Update'}
        </Button>
    {/snippet}
</Sheet>
