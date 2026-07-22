<script lang="ts" module>
    export type TripStatusValue = 'Upcoming' | 'Active' | 'Past' | 'Archived' | 'Planning';
</script>

<script lang="ts">
    import Badge from '$lib/components/ui/Badge.svelte';
    import type { BadgeVariant } from '$lib/components/ui/Badge.svelte';
    import { t } from '$lib/i18n.svelte';

    interface Props {
        status: TripStatusValue;
        class?: string;
    }

    let { status, class: className }: Props = $props();

    const map: Record<TripStatusValue, { variant: BadgeVariant; labelKey: string }> = {
        Active: { variant: 'success', labelKey: 'active_now' },
        Upcoming: { variant: 'primary', labelKey: 'upcoming' },
        Past: { variant: 'neutral', labelKey: 'past' },
        Archived: { variant: 'neutral', labelKey: 'archived' },
        Planning: { variant: 'warning', labelKey: 'planning' }
    };

    const current = $derived({
        variant: (map[status] ?? map.Upcoming).variant,
        label: t((map[status] ?? map.Upcoming).labelKey)
    });
</script>

<Badge variant={current.variant} class={className}>{current.label}</Badge>