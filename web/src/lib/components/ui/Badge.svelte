<script lang="ts" module>
    export type BadgeVariant =
        'neutral'
        | 'primary'
        | 'success'
        | 'warning'
        | 'danger'
        | 'info';
</script>

<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '$lib/utils';

    interface Props {
        variant?: BadgeVariant;
        class?: string;
        children: Snippet;
    }

    let { variant = 'neutral', class: className, children }: Props = $props();

    const variants: Record<BadgeVariant, string> = {
        neutral: 'border-border bg-surface-sunken text-ink-muted',
        primary: 'border-primary-100 bg-primary-100 text-primary-700 dark:border-primary-700/40 dark:bg-primary-900/30 dark:text-primary-300',
        success: 'border-success/30 bg-success/10 text-success dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400',
        warning: 'border-amber-700/30 bg-amber-500/15 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-300',
        danger: 'border-danger/30 bg-danger/10 text-danger dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-400',
        info: 'border-info/30 bg-info/10 text-info dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300',
    };
</script>

<span
    class={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className
    )}
>
    {@render children()}
</span>
