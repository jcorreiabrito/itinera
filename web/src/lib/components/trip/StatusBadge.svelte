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

    const map: Record<TripStatusValue, { variant: BadgeVariant; label: string }> = {
        Active: { variant: 'success', label: t('active_now') },
        Upcoming: { variant: 'primary', label: t('upcoming') },
        Past: { variant: 'neutral', label: t('past') },
        Archived: { variant: 'neutral', label: t('archived') },
        Planning: { variant: 'warning', label: t('planning') }
    };

    const current = $derived(map[status] ?? map.Upcoming);
</script>

<Badge variant={current.variant} class={className}>{current.label}</Badge>