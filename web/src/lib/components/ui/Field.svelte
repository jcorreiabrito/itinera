<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '$lib/utils';

    interface Props {
        label: string;
        /** Associates the label with the control (set the same id on the input). */
        for?: string;
        error?: string | null;
        hint?: string;
        required?: boolean;
        class?: string;
        children: Snippet;
    }

    let {
        label,
        for: forId,
        error = null,
        hint,
        required = false,
        class: className,
        children
    }: Props = $props();
</script>

<div class={cn('flex flex-col gap-1.5', className)}>
    <label for={forId} class="text-sm font-medium text-ink">
        {label}{#if required}<span class="text-danger" aria-hidden="true"> *</span>{/if}
    </label>
    {@render children()}
    {#if error}
        <p class="text-xs text-danger">{error}</p>
    {:else if hint}
        <p class="text-xs text-ink-muted">{hint}</p>
    {/if}
</div>
