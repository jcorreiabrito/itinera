<script lang="ts">
    import { Plus } from 'lucide-svelte';
    import { expenses, todayIso } from '$lib/db';
    import type { ExpenseCategory } from '$lib/db';
    import { Button, Input, Select, toast } from '$lib/components/ui';
    import { CATEGORY_ORDER, CATEGORY_META, categoryLabel } from './labels';

    interface Props {
        /** Bare trip ULID. */
        tripId: string;
        homeCurrency: string;
        onsaved?: () => void;
    }

    let { tripId, homeCurrency, onsaved }: Props = $props();

    let amount = $state('');
    let category = $state<ExpenseCategory>('food');
    let date = $state(todayIso());
    let saving = $state(false);

    const amountNum = $derived(Number(amount));
    const valid = $derived(amount.trim() !== '' && Number.isFinite(amountNum) && amountNum > 0);

    async function add() {
        if (!valid || saving) return;
        saving = true;
        try {
            await expenses.create(tripId, {
                description: categoryLabel(category),
                category,
                date: date || null,
                amountActual: amountNum,
                currency: homeCurrency,
                paid: false
            });
            amount = '';
            onsaved?.();
        } catch {
            toast.error('Could not add the expense. Try again.');
        } finally {
            saving = false;
        }
    }
</script>

<form
    class="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3 shadow-soft"
    onsubmit={(e) => {
        e.preventDefault();
        add();
    }}
>
    <div class="min-w-[7rem] flex-1">
        <label for="quick-amount" class="mb-1 block text-xs font-medium text-ink-muted">
            Quick add ({homeCurrency})
        </label>
        <Input
            id="quick-amount"
            type="number"
            inputmode="decimal"
            min={0}
            step="any"
            value={amount}
            placeholder="Amount"
            oninput={(e) => (amount = e.currentTarget.value)}
        />
    </div>

    <div class="min-w-[8rem] flex-1">
        <label for="quick-category" class="mb-1 block text-xs font-medium text-ink-muted">Category</label>
        <Select
            id="quick-category"
            value={category}
            onchange={(e) => (category = e.currentTarget.value as ExpenseCategory)}
        >
            {#each CATEGORY_ORDER as cat (cat)}
                <option value={cat}>{CATEGORY_META[cat].label}</option>
            {/each}
        </Select>
    </div>

    <div class="min-w-[8.5rem] flex-1">
        <label for="quick-date" class="mb-1 block text-xs font-medium text-ink-muted">Day</label>
        <Input
            id="quick-date"
            type="date"
            value={date}
            oninput={(e) => (date = e.currentTarget.value)}
        />
    </div>

    <Button type="submit" disabled={!valid || saving} class="shrink-0">
        <Plus class="size-4" />
        Add
    </Button>
</form>