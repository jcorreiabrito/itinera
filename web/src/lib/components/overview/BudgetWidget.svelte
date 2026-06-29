<script lang="ts">
    import { expenses } from '$lib/db';
    import { Wallet } from 'lucide-svelte';
    import { ProgressBar } from '$lib/components/ui';
    import { formatMoney } from '$lib/format';
    import WidgetCard from './WidgetCard.svelte';

    interface Props {
        budget: expenses.BudgetSummary;
        href: string;
    }

    let { budget, href }: Props = $props();

    const cur = $derived(budget.homeCurrency);
    const tone = $derived(
        budget.usedFraction == null
            ? 'primary'
            : budget.usedFraction > 1
              ? 'danger'
              : budget.usedFraction > 0.85
                ? 'warning'
                : 'success'
    );
</script>

<WidgetCard title="Budget" icon={Wallet} {href} linkLabel="Costs">
    {#if budget.budgetTotal != null}
        <div class="flex items-baseline justify-between gap-2">
            <span class="text-lg font-semibold tabular-nums text-ink">{formatMoney(budget.spent, cur)}</span>
            <span class="text-sm text-ink-muted">of {formatMoney(budget.budgetTotal, cur)}</span>
        </div>
        <ProgressBar class="mt-2" tone={tone} value={budget.usedFraction ?? 0} label="Budget used" />
        <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
                <dt class="text-ink-muted">Remaining</dt>
                <dd
                    class="font-medium tabular-nums ${budget.remaining != null && budget.remaining < 0 ? 'text-danger' : 'text-ink'}"
                >
                    {formatMoney(budget.remaining ?? 0, cur)}
                </dd>
            </div>
            <div>
                <dt class="text-ink-muted">Daily avg</dt>
                <dd class="font-medium tabular-nums text-ink">{formatMoney(budget.dailyAverage, cur)}</dd>
            </div>
        </dl>
    {:else}
        <div class="flex items-baseline justify-between gap-2">
            <span class="text-lg font-semibold tabular-nums text-ink">{formatMoney(budget.spent, cur)}</span>
            <span class="text-sm text-ink-muted">spent</span>
        </div>
        <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
                <dt class="text-ink-muted">Estimated</dt>
                <dd class="font-medium tabular-nums text-ink">{formatMoney(budget.estimate, cur)}</dd>
            </div>
            <div>
                <dt class="text-ink-muted">Daily avg</dt>
                <dd class="font-medium tabular-nums text-ink">{formatMoney(budget.dailyAverage, cur)}</dd>
            </div>
        </dl>
        <p class="mt-2 text-xs text-ink-muted">No budget set yet.</p>
    {/if}
    {#if budget.missingRateCount > 0}
        <p class="mt-2 text-xs text-warning">
            {budget.missingRateCount}
            {budget.missingRateCount === 1 ? 'expense needs' : 'expenses need'} an exchange rate.
        </p>
    {/if}
</WidgetCard>