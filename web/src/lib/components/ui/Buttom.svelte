<script lang="ts" module>
    export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
    export type ButtonSize = 'sm' | 'md' | 'lg';
</script>

<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '$lib/utils';

    interface Props {
        variant?: ButtonVariant;
        size?: ButtonSize;
        href?: string;
        type?: 'button' | 'submit' | 'reset';
        class?: string;
        children: Snippet;
        [key: string]: unknown;
    }

    let {
        variant = 'primary',
        size = 'md',
        href,
        type = 'button',
        class: className,
        children,
        ...rest
    }: Props = $props();

    const base = 'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50';
    const variants: Record<ButtonVariant, string> = {
        primary: 'bg-primary-600 text-white shadow-sm hover:bg-primary-700 active:bg-primary-700',
        secondary: 'bg-surface-100 hover:bg-surface-200 text-ink hover:text-ink-hover',
        ghost: 'bg-transparent text-ink hover:bg-surface-sunken',
        destructive: 'bg-danger text-white shadow-sm hover:bg-danger-50 active:brightness-90',
    };

    // sm: h-8 px-3
    const sizes: Record<ButtonSize, string> = {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-lg',
    };

    const classes = cn(base, variants[variant], sizes[size], className);
</script>

{#if href}
    <a href={href} class={classes} {...rest}>
        {@render children()}
    </a>
{:else}
    <button type={type} class={classes} {...rest}>
        {@render children()}
    </button>
{/if}
