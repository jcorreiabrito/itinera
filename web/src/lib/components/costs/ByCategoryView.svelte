<script lang="ts">
    import type { expenses } from '$lib/db';
    import { formatMoney } from '$lib/format';
    import { Badge } from '$lib/components/ui';
    import CostBar from './CostBar.svelte';
    import { categoryIcon, categoryLabel } from './labels';

    interface Props {
        categories: expenses.CategoryBudgetRow[];
        homeCurrency: string;
        summary: expenses.BudgetSummary;
        unpaidOnly?: boolean;
    }

    let { categories, homeCurrency, summary, unpaidOnly = false }: Props = $props();

    const money = (n: number) => formatMoney(n, homeCurrency);

    const visible = $derived(
        categories.filter((c) => (unpaidOnly ? c.totals.unpaid > 0 : c.totals.spent > 0))
    );

    const scale = $derived(
        Math.max(1, ...categories.map((c) => Math.max(c.totals.spent, c.cap ?? 0)))
    );
</script>

{#if visible.length == 0}
    <p class="rounded-lg border border-dashed border-border bg-surface-sunken px-4 py-8 text-center text-sm text-ink-muted">
        {unpaidOnly ? 'Nothing outstanding – every cost is paid.' : 'No costs yet.'}
    </p>
{:else}
    <ul class="space-y-2.5">
        {#each visible as row (row.category)}
            {@const t = row.totals}
            {@const Icon = categoryIcon(row.category)}
            <li class="rounded-lg border border-border bg-surface p-3.5 shadow-soft">
                <div class="flex items-baseline justify-between gap-3">
                    <h3 class="flex items-center gap-2 font-medium [&_svg]:size-4 [&_svg]:text-ink-muted">
                        <Icon aria-hidden="true" />
                        {categoryLabel(row.category)}
                    </h3>
                    <span class="text-base font-semibold tabular-nums">
                        {money(unpaidOnly ? t.unpaid : t.spent)}
                    </span>
                </div>
                {#if unpaidOnly}
                    <p class="mt-1 text-xs text-ink-muted">Outstanding (unpaid)</p>
                {:else}
                    <div class="mt-2">
                        <CostBar
                            value={t.spent}
                            target={row.cap}
                            max={scale}
                            tone={row.overCap ? 'warning' : 'primary'}
                        />
                    </div>
                    <div class="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-ink-muted">
                        <span class="tabular-nums">
                            Est. {money(t.estimate)} • Actual {money(t.actual)}
                        </span>
                        {#if row.overCap && row.cap != null}
                            <Badge variant="warning">Over cap • {money(t.spent - row.cap)}</Badge>
                        {:else if row.cap != null}
                            <span class="tabular-nums">Cap {money(row.cap)}</span>
                        {/if}
                    </div>
                {/if}

                <span class="sr-only">
                    {categoryLabel(row.category)}: {money(t.spent)} spent{row.cap != null
                        ? ` of ${money(row.cap)} cap`
                        : ''}{row.overCap ? `, over cap ` : ''}.
                    {#if t.unpaid > 0}{money(t.unpaid)} unpaid.{/if}
                </span>
            </li>
        {/each}
    </ul>

    <div class="mt-4 flex items-center justify-between rounded-lg bg-primary-100 px-4 py-3">
        <span class="font-medium text-primary-700">Total</span>
        {#if unpaidOnly}
            <span class="font-semibold tabular-nums text-primary-700">{money(summary.unpaid)}</span>
        {:else}
            <span class="text-sm font-medium tabular-nums text-primary-700">
                Estimated <span class="text-base font-semibold">{money(summary.estimate)}</span>
                <span aria-hidden="true" class="mx-1 opacity-50">/</span>
                Actual <span class="text-base font-semibold">{money(summary.actual)}</span>
            </span>
        {/if}
    </div>
{/if}