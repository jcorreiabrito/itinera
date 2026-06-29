<script lang="ts">
    import { cn } from '$lib/utils';

    interface Props {
        class?: string;
    }

    let { class: className }: Props = $props();
</script>

<div
    class={cn('relative overflow-hidden rounded-md bg-surface-sunken', className)}
    aria-hidden="true"
>
    <div
        class="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent"
    ></div>
</div>
