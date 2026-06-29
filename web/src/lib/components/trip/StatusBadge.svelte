<script lang="ts" module>
    export type TripStatusValue = 'Upcoming' | 'Active' | 'Past' | 'Archived';
</script>

<script lang="ts">
    import Badge from '$lib/components/ui/Badge.svelte';
    import type { BadgeVariant } from '$lib/components/ui/Badge.svelte';

    interface Props {
        status: TripStatusValue;
        class?: string;
    }

    let { status, class: className }: Props = $props();

    const map: Record<TripStatusValue, { variant: BadgeVariant; label: string }> = {
        Active: { variant: 'success', label: 'Active' },
        Upcoming: { variant: 'primary', label: 'Upcoming' },
        Past: { variant: 'neutral', label: 'Past' },
        Archived: { variant: 'neutral', label: 'Archived' }
    };

    const current = $derived(map[status] ?? map.Upcoming);
</script>

<Badge variant={current.variant} class={className}>{current.label}</Badge>