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
        primary: 'border-primary-100 bg-primary-100 text-primary-700',
        success: 'border-success/20 bg-success/10 text-success',
        warning: 'border-warning/20 bg-warning/10 text-warning',
        danger: 'border-danger/20 bg-danger/10 text-danger',
        info: 'border-info/20 bg-info/10 text-info',
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
