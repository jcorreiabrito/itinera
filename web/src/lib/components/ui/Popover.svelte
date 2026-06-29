<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '$lib/utils';

    interface Props {
        open?: boolean;
        /** Horizontal anchor edge of the panel. */
        align?: 'start' | 'end';
        /** Accessible label for the popup group. */
        label?: string;
        class?: string;
        panelClass?: string;
        /** Renders the trigger; receives a `toggle` callback and the open state. */
        trigger: Snippet<[{ toggle: () => void; open: boolean }]>;
        children: Snippet;
    }

    let {
        open = $bindable(false),
        align = 'end',
        label,
        class: className,
        panelClass,
        trigger,
        children
    }: Props = $props();

    let root = $state<HTMLElement>();

    function toggle() {
        open = !open;
    }

    $effect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (root && !root.contains(event.target as Node)) open = false;
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') open = false;
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
        };
    });
</script>

<div class={cn('relative inline-block', className)} bind:this={root}>
    {@render trigger({ toggle, open })}
    {#if open}
        <div
            role="group"
            aria-label={label}
            class={cn(
                'absolute z-50 mt-2 min-w-[12rem] rounded-lg border border-border bg-surface p-1 shadow-card',
                align === 'end' ? 'right-0' : 'left-0',
                panelClass
            )}
        >
            {@render children()}
        </div>
    {/if}
</div>
