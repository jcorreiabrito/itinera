<script lang="ts">
    import { Search } from 'lucide-svelte';
    import { cn } from '$lib/utils';
    import { expenseAmounts } from '$lib/db';
    import type { Expense } from '$lib/db';
    import { Input, Select } from '$lib/components/ui';
    import { categoryLabel } from './labels';
    import ExpenseRow from './ExpenseRow.svelte';

    interface Props {
        expenses: Expense[];
        homeCurrency: string;
        /** Global unpaid-only master toggle (overrides the local paid filter). */
        unpaidOnly?: boolean;
        travelerCount?: number;
        onedit: (expense: Expense) => void;
        ontogglePaid: (expense: Expense) => void;
    }

    let { expenses, homeCurrency, unpaidOnly = false, travelerCount = 1, onedit, ontogglePaid }: Props = $props();

    let search = $state('');
    let paidFilter = $state<'all' | 'paid' | 'unpaid'>('all');
    let sort = $state<'date' | 'amount'>('date');

    const homeSpent = (e: Expense) => {
        const base = expenseAmounts(e, homeCurrency).spent ?? 0;
        return e.costType === 'per_person' ? base * travelerCount : base;
    };

    const rows = $derived.by(() => {
        const q = search.trim().toLowerCase();
        let list = expenses.slice();

        if (unpaidOnly) list = list.filter((e) => !e.paid);
        else if (paidFilter === 'paid') list = list.filter((e) => e.paid);
        else if (paidFilter === 'unpaid') list = list.filter((e) => !e.paid);

        if (q) {
            list = list.filter(
                (e) =>
                    (e.description ?? '').toLowerCase().includes(q) ||
                    categoryLabel(e.category ?? 'other').toLowerCase().includes(q)
            );
        }

        if (sort === 'amount') {
            list.sort((a, b) => homeSpent(b) - homeSpent(a));
        } else {
            list.sort((a, b) => {
                const ad = a.date ?? '';
                const bd = b.date ?? '';
                if (ad && bd) return ad < bd ? 1 : ad > bd ? -1 : 0;
                if (ad && !bd) return -1;
                if (!ad && bd) return 1;
                return 0;
            });
        }
        return list;
    });

    const chipClass = (active: boolean) =>
        cn(
            `inline-flex min-h-touch items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                    ? 'border-primary-600 bg-primary-600 text-white'
                    : 'border-border bg-surface text-ink-muted hover:text-ink'
            }`
        );
</script>

<div class="space-y-3">
    <div class="relative">
        <Search
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
        />
        <Input
            type="search"
            value={search}
            placeholder="Search expenses..."
            class="pl-9"
            oninput={(e) => (search = e.currentTarget.value)}
        />
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
        {#if !unpaidOnly}
            <div class="flex flex-wrap gap-2" role="group" aria-label="Filter by paid status">
                <button type="button" onclick={() => (paidFilter = 'all')} aria-pressed={paidFilter === 'all'} class={chipClass(paidFilter === 'all')}>All</button>
                <button type="button" onclick={() => (paidFilter = 'unpaid')} aria-pressed={paidFilter === 'unpaid'} class={chipClass(paidFilter === 'unpaid')}>Unpaid</button>
                <button type="button" onclick={() => (paidFilter = 'paid')} aria-pressed={paidFilter === 'paid'} class={chipClass(paidFilter === 'paid')}>Paid</button>
            </div>
        {:else}
            <p class="text-sm text-ink-muted">Showing unpaid only.</p>
        {/if}

        <label class="flex items-center gap-2 text-sm text-ink-muted">
            <span>Sort</span>
            <Select value={sort} class="h-9 w-auto" onchange={(e) => (sort = e.currentTarget.value as 'date' | 'amount')}>
                <option value="date">By date</option>
                <option value="amount">By amount</option>
            </Select>
        </label>
    </div>

    {#if rows.length === 0}
        <p class="rounded-lg border border-dashed border-border bg-surface-sunken px-4 py-8 text-center text-sm text-ink-muted">
            No matching expenses.
        </p>
    {:else}
        <p class="text-xs text-ink-muted">{rows.length} {rows.length === 1 ? 'expense' : 'expenses'}</p>
        <ul class="space-y-2.5">
            {#each rows as expense (expense._id)}
                <ExpenseRow
                    {expense}
                    {homeCurrency}
                    onedit={() => onedit(expense)}
                    ontogglePaid={() => ontogglePaid(expense)}
                />
            {/each}
        </ul>
    {/if}
</div>