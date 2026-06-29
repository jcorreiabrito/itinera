<script lang="ts">
    import type { Snippet } from 'svelte';
    import { cn } from '$lib/utils';

    interface Props {
        class?: string;
        children: Snippet;
        [key: string]: unknown;
    }

    let { class: className, children, ...rest }: Props = $props();
</script>

<div class={cn('rounded-lg border border-border bg-surface shadow-card', className)} {...rest}>
    {@render children()}
</div>
