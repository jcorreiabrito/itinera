<script lang="ts">
    import { Lightbulb, Check } from 'lucide-svelte';
    import { DateTime } from 'luxon';
    import { Dialog } from '$lib/components/ui';
    import { cn } from '$lib/utils';

    interface Props {
        open?: boolean;
        /** Trip dates (ISO) to choose from. */
        dates: string[];
        /** The item's current date ('null' = Unscheduled). */
        current: string | null;
        /** Item title, for the dialog description. */
        title?: string;
        onmove: (date: string | null) => void;
    }

    let { open = $bindable(false), dates, current, title, onmove }: Props = $props();

    function label(iso: string): string {
        const dt = DateTime.fromISO(iso);
        return dt.isValid ? dt.toFormat('ccc d LLL') : iso;
    }

    function choose(date: string | null) {
        open = false;
        if (date !== current) onmove(date);
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
    title="Move to day"
    description={title ? `Where should "${title}" go?` : undefined}
>
    <ul class="flex flex-col gap-1.5">
        <li>
            <button type="button" class={rowClass(current === null)} onclick={() => choose(null)}>
                <span class="flex items-center gap-2">
                    <Lightbulb class="size-4 text-accent-terracotta" />
                    Unscheduled (Ideas)
                </span>
                {#if current === null}<Check class="size-4" />{/if}
            </button>
        </li>
        {#each dates as date (date)}
            <li>
                <button type="button" class={rowClass(current === date)} onclick={() => choose(date)}>
                    <span>{label(date)}</span>
                    {#if current === date}<Check class="size-4" />{/if}
                </button>
            </li>
        {/each}
    </ul>
</Dialog>
