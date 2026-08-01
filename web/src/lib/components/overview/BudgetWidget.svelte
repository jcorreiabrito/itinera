<script lang="ts">
    import { expenses } from '$lib/db';
    import { Wallet } from 'lucide-svelte';
    import { ProgressBar } from '$lib/components/ui';
    import { formatMoney } from '$lib/format';
    import { t } from '$lib/i18n.svelte';
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

<WidgetCard title={t('costs')} icon={Wallet} {href} linkLabel={t('costs')}>
    {#if budget.travelerCount > 1}
        <div class="space-y-4">
            <!-- Group Total -->
            <div>
                <div class="text-xs font-semibold uppercase tracking-wider text-ink-muted/80">{t('total_budget')}</div>
                <div class="flex items-baseline justify-between gap-2 mt-1">
                    <span class="text-lg font-semibold tabular-nums text-ink">{formatMoney(budget.spent, cur)}</span>
                    {#if budget.budgetTotal != null}
                        <span class="text-sm text-ink-muted">/ {formatMoney(budget.budgetTotal, cur)}</span>
                    {/if}
                </div>
                {#if budget.budgetTotal != null}
                    <ProgressBar class="mt-1.5" tone={tone} value={budget.usedFraction ?? 0} label={t('budget_used')} />
                {/if}
            </div>

            <!-- Per Person -->
            <div class="border-t border-border/60 pt-3">
                <div class="text-xs font-semibold uppercase tracking-wider text-ink-muted/80">{t('per_person_cost')} ({budget.travelerCount} {t('travelers').toLowerCase()})</div>
                <div class="flex items-baseline justify-between gap-2 mt-1">
                    <span class="text-lg font-semibold tabular-nums text-ink">
                        {formatMoney(budget.spent / budget.travelerCount, cur)}
                    </span>
                    {#if budget.budgetTotal != null}
                        <span class="text-sm text-ink-muted">
                            / {formatMoney(budget.budgetTotal / budget.travelerCount, cur)}
                        </span>
                    {/if}
                </div>
                {#if budget.budgetTotal != null}
                    <ProgressBar class="mt-1.5" tone={tone} value={budget.usedFraction ?? 0} label={t('per_person_cost')} />
                {/if}
            </div>

            <dl class="grid grid-cols-2 gap-3 text-sm border-t border-border/60 pt-3">
                {#if budget.budgetTotal != null}
                    <div>
                        <dt class="text-ink-muted">{t('remaining')}</dt>
                        <dd class="font-medium tabular-nums {budget.remaining != null && budget.remaining < 0 ? 'text-danger' : 'text-ink'}">
                            {formatMoney(budget.remaining ?? 0, cur)}
                        </dd>
                    </div>
                {:else}
                    <div>
                        <dt class="text-ink-muted">{t('estimated')}</dt>
                        <dd class="font-medium tabular-nums text-ink">{formatMoney(budget.estimate, cur)}</dd>
                    </div>
                {/if}
                <div>
                    <dt class="text-ink-muted">Média diária</dt>
                    <dd class="font-medium tabular-nums text-ink">{formatMoney(budget.dailyAverage, cur)}</dd>
                </div>
            </dl>
        </div>
    {:else}
        <!-- Original layout for 1 traveler -->
        {#if budget.budgetTotal != null}
            <div class="flex items-baseline justify-between gap-2">
                <span class="text-lg font-semibold tabular-nums text-ink">{formatMoney(budget.spent, cur)}</span>
                <span class="text-sm text-ink-muted">/ {formatMoney(budget.budgetTotal, cur)}</span>
            </div>
            <ProgressBar class="mt-2" tone={tone} value={budget.usedFraction ?? 0} label={t('budget_used')} />
            <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                    <dt class="text-ink-muted">{t('remaining')}</dt>
                    <dd
                        class="font-medium tabular-nums {budget.remaining != null && budget.remaining < 0 ? 'text-danger' : 'text-ink'}"
                    >
                        {formatMoney(budget.remaining ?? 0, cur)}
                    </dd>
                </div>
                <div>
                    <dt class="text-ink-muted">Média diária</dt>
                    <dd class="font-medium tabular-nums text-ink">{formatMoney(budget.dailyAverage, cur)}</dd>
                </div>
            </dl>
        {:else}
            <div class="flex items-baseline justify-between gap-2">
                <span class="text-lg font-semibold tabular-nums text-ink">{formatMoney(budget.spent, cur)}</span>
                <span class="text-sm text-ink-muted">{t('spent')}</span>
            </div>
            <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                    <dt class="text-ink-muted">{t('estimated')}</dt>
                    <dd class="font-medium tabular-nums text-ink">{formatMoney(budget.estimate, cur)}</dd>
                </div>
                <div>
                    <dt class="text-ink-muted">Média diária</dt>
                    <dd class="font-medium tabular-nums text-ink">{formatMoney(budget.dailyAverage, cur)}</dd>
                </div>
            </dl>
        {/if}
    {/if}
</WidgetCard>