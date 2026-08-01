<script lang="ts">
    import type { ChecklistItem } from '$lib/db';
    import { Circle, ListChecks } from 'lucide-svelte';
    import { ProgressBar } from '$lib/components/ui';
    import { t } from '$lib/i18n.svelte';
    import WidgetCard from './WidgetCard.svelte';

    interface Props {
        done: number;
        total: number;
        fraction: number;
        top: ChecklistItem[];
        href: string;
    }

    let { done, total, fraction, top, href }: Props = $props();
</script>

<WidgetCard title={t('checklist')} icon={ListChecks} {href} linkLabel={t('checklist')}>
    {#if total > 0}
        <div class="flex items-center gap-3">
            <ProgressBar class="flex-1" tone="success" value={fraction} label={t('checklist_progress')} />
            <span class="shrink-0 font-medium tabular-nums text-ink">{done}/{total}</span>
        </div>
        {#if top.length}
            <ul class="mt-3 space-y-1.5">
                {#each top as item (item._id)}
                    <li class="flex min-w-0 items-center gap-2 text-sm text-ink-muted">
                        <Circle class="size-3.5 shrink-0" />
                        <span class="min-w-0 flex-1 truncate">{item.text ?? 'Untitled'}</span>
                    </li>
                {/each}
            </ul>
        {:else}
            <p class="mt-2 text-sm font-medium text-success">{t('packed')}</p>
        {/if}
    {:else}
        <p class="text-sm text-ink-muted">
            {t('checklist_not_started')} –
            <a {href} class="font-medium text-primary-700 hover:underline">{t('add_item')}</a>.
        </p>
    {/if}
</WidgetCard>
