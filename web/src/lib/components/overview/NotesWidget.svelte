<script lang="ts">
    import { NotebookPen } from 'lucide-svelte';
    import { renderMarkdown } from '$lib/markdown';
    import WidgetCard from './WidgetCard.svelte';

    interface Props {
        notes?: string | null;
        onedit: () => void;
    }

    let { notes, onedit }: Props = $props();

    const html = $derived(renderMarkdown(notes));
</script>

<WidgetCard title="Notes" icon={NotebookPen}>
    {#snippet action()}
        <button
            type="button"
            onclick={onedit}
            class="text-xs font-medium text-primary-700 hover:underline"
        >
            Edit
        </button>
    {/snippet}

    {#if html}
        <!-- `html` is produced by the safe Markdown renderer (escaped + allowlisted tags). -->
        <div class="space-y-1 text-sm leading-relaxed text-ink">
            {@html html}
        </div>
    {:else}
        <button type="button" onclick={onedit} class="text-sm text-primary-700 hover:underline">
            Add notes
        </button>
    {/if}
</WidgetCard>