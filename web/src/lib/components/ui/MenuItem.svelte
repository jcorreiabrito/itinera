<script lang="ts" module>
    export type MenuItemTone = 'default' | 'danger';
</script>

<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { IconComponent } from '$lib/types';
    import { cn } from '$lib/utils';

    interface Props {
        icon?: IconComponent;
        tone?: MenuItemTone;
        disabled?: boolean;
        href?: string;
        class?: string;
        onclick?: () => void;
        children: Snippet;
    }

    let { icon, tone = 'default', disabled = false, href, class: className, onclick, children }: Props = $props();

    const base = 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';
    const tones: Record<MenuItemTone, string> = {
        default: 'text-ink hover:bg-surface-sunken',
        danger: 'text-danger hover:bg-danger/10'
    };
    const classes = $derived(cn(base, tones[tone], className));
</script>

{#if href}
    <a {href} class={classes}>
        {#if icon}{@const Icon = icon}<Icon />{/if}
        {@render children()}
    </a>
{:else}
    <button type="button" {disabled} {onclick} class={classes}>
        {#if icon}{@const Icon = icon}<Icon />{/if}
        {@render children()}
    </button>
{/if}
