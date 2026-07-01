<script lang="ts">
    import { Check, Circle, TriangleAlert } from 'lucide-svelte';
    import { expenseAmounts, trips } from '$lib/db';
    import type { Expense } from '$lib/db';
    import { formatMoney, formatWeekdayDate } from '$lib/format';
    import { Badge } from '$lib/components/ui';
    import { categoryIcon, categoryLabel, sourceMeta } from './labels';

    interface Props {
        expense: Expense;
        homeCurrency: string;
        onedit: () => void;
        ontogglePaid: () => void;
    }

    let { expense, homeCurrency, onedit, ontogglePaid }: Props = $props();

    const amounts = $derived(expenseAmounts(expense, homeCurrency));
    const Icon = $derived(categoryIcon(expense.category ?? 'other'));
    const source = $derived(sourceMeta(expense.linkedType));
    const origValue = $derived(expense.amountActual ?? expense.amountEstimate ?? null);
    const cur = $derived(expense.currency || homeCurrency);
    const foreign = $derived(!!expense.currency && expense.currency !== homeCurrency);
    const paid = $derived(expense.paid ?? false);

    let travelerCount = $state(1);

    $effect(() => {
        if (expense.tripid) {
            trips.get(expense.tripid).then((t) => {
                travelerCount = t?.travelerCount ?? 1;
            });
        }
    });
</script>

<li class="flex items-stretch overflow-hidden rounded-lg border border-border bg-surface shadow-soft">
    <button
        type="button"
        onclick={onedit}
        class="flex flex-1 items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-sunken/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
    >
        <span
            class="grid size-9 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700 [&_svg]:size-4"
            aria-hidden="true"
        >
            <Icon />
        </span>

        <span class="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span class="truncate font-medium">
                        {expense.description?.trim() || categoryLabel(expense.category ?? 'other')}
                    </span>
                    {#if source}
                        {@const SrcIcon = source.icon}
                        <Badge variant="info" class="[&_svg]:size-3">
                            <SrcIcon aria-hidden="true" />
                            {source.label}
                        </Badge>
                    {/if}
                </span>
                <span class="mt-0.5 block text-xs text-ink-muted">
                    {expense.date ? formatWeekdayDate(expense.date) : 'Whole-trip cost'}
                    <span aria-hidden="true"> · </span>
                    {categoryLabel(expense.category ?? 'other')}
                    {#if travelerCount > 1}
                        <span aria-hidden="true"> · </span>
                        <span class="font-medium text-ink-muted/80">
                            {expense.costType === 'per_person' ? 'Per Person' : 'Group Total'}
                        </span>
                    {/if}
                </span>
            </span>

            <span class="shrink-0 text-left sm:text-right flex flex-wrap sm:flex-col items-baseline sm:items-end gap-x-2 gap-y-0.5 mt-1 sm:mt-0">
                {#if origValue == null}
                    <span class="text-sm text-ink-muted">—</span>
                {:else}
                    <span class="block font-semibold tabular-nums text-sm sm:text-base">
                        {formatMoney(origValue, cur)}
                        {#if expense.costType === 'per_person' && travelerCount > 1}
                            <span class="text-[10px] font-normal text-ink-muted">/pp</span>
                        {/if}
                    </span>
                    {#if foreign}
                        {#if amounts.missingRate}
                            <Badge variant="warning" class="mt-0.5 [&_svg]:size-3">
                                <TriangleAlert aria-hidden="true" /> Needs rate
                            </Badge>
                        {:else}
                            <span class="block text-xs text-ink-muted tabular-nums">
                                {formatMoney((amounts.spent ?? 0) * (expense.costType === 'per_person' ? travelerCount : 1), homeCurrency)}
                                {#if expense.costType === 'per_person' && travelerCount > 1}
                                    <span class="text-[9px] font-normal text-ink-muted">total</span>
                                {/if}
                            </span>
                        {/if}
                    {:else if expense.costType === 'per_person' && travelerCount > 1}
                        <span class="block text-xs text-ink-muted tabular-nums">
                            {formatMoney(origValue * travelerCount, homeCurrency)}
                            <span class="text-[9px] font-normal text-ink-muted">total</span>
                        </span>
                    {/if}
                {/if}
            </span>
        </span>
    </button>

    <button
        type="button"
        onclick={ontogglePaid}
        aria-pressed={paid}
        aria-label={paid ? 'Paid – mark as unpaid' : 'Unpaid – mark as paid'}
        class="flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-l border-border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600 [&_svg]:size-4
            {paid
                ? 'bg-success/10 text-success hover:bg-success/15'
                : 'text-ink-muted hover:bg-surface-sunken'}"
    >
        {#if paid}
            <Check aria-hidden="true" />
            Paid
        {:else}
            <Circle aria-hidden="true" />
            Unpaid
        {/if}
    </button>
</li>
