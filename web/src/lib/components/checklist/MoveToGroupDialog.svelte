<script lang="ts">
    import { CHECKLIST_PRESET_GROUPS } from '$lib/db';
    import { Check, Plus } from 'lucide-svelte';
    import { Button, Dialog, Input } from '$lib/components/ui';
    import { cn } from '$lib/utils';

    interface Props {
        open?: boolean;
        /** The item's current group. */
        current?: string;
        /** Existing custom groups (merged with the presets). */
        groups?: string[];
        /** Item text, for the dialog description. */
        title?: string;
        onmove: (group: string) => void;
    }

    let { open = $bindable(false), current, groups = [], title, onmove }: Props = $props();

    let newGroup = $state('');

    const options = $derived(
        Array.from(new Set([...CHECKLIST_PRESET_GROUPS, ...groups])).filter(Boolean)
    );

    function choose(group: string) {
        open = false;
        if (group !== current) onmove(group);
    }

    function addNew() {
        const g = newGroup.trim();
        if (!g) return;
        newGroup = '';
        choose(g);
    }

    const rowClass = (active: boolean) =>
        cn(
            'flex min-h-touch w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
            active
                ? 'border-primary-600 bg-primary-100 text-primary-700'
                : 'border-border bg-surface text-ink hover:bg-surface-sunken'
        );
</script>

<Dialog
    bind:open
    title="Move to group"
    description={title ? `Where should "${title}" go?` : undefined}
>
    <ul class="flex flex-col gap-1.5">
        {#each options as group (group)}
            <li>
                <button type="button" class={rowClass(group === current)} onclick={() => choose(group)}>
                    <span>{group}</span>
                    {#if group === current}<Check class="size-4" />{/if}
                </button>
            </li>
        {/each}
    </ul>

    <form
        class="mt-3 flex items-center gap-2 border-t border-border pt-3"
        onsubmit={(e) => {
            e.preventDefault();
            addNew();
        }}
    >
        <label for="move-new-group" class="sr-only">New group name</label>
        <Input
            id="move-new-group"
            class="h-10 flex-1"
            value={newGroup}
            placeholder="New group..."
            oninput={(e) => (newGroup = e.currentTarget.value)}
        />
        <Button type="submit" variant="secondary" size="sm" disabled={!newGroup.trim()}>
            <Plus class="size-4" />
            Add
        </Button>
    </form>
</Dialog>