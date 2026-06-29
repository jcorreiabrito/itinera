<script lang="ts">
    import { onMount } from 'svelte';
    import { expenses, trips } from '$lib/db';
    import type { Expense, Trip } from '$lib/db';
    import { Plus, Wallet } from 'lucide-svelte';
    import { Button, ErrorState, Skeleton, toast } from '$lib/components/ui';
    import { getTripShellContext } from '$lib/trip-context';
    import { startLive } from '$lib/live';
    import { cn } from '$lib/utils';
    import SummaryHeader from './SummaryHeader.svelte';
    import QuickAdd from './QuickAdd.svelte';
    import ByDayView from './ByDayView.svelte';
    import ByCategoryView from './ByCategoryView.svelte';
    import ListView from './ListView.svelte';
    import ExpenseSheet from './ExpenseSheet.svelte';
    import BudgetSheet from './BudgetSheet.svelte';

    interface Props {
        /** Bare trip ULID. */
        tripId: string;
    }

    let { tripId }: Props = $props();

    const shell = getTripShellContext();
    const reloadSignal = shell.reloadSignal;

    type View = 'day' | 'category' | 'list';

    let loaded = $state(false);
    let loadError = $state(false);
    let everLoaded = false;
    let trip = $state<Trip | null>(null);
    let summary = $state<expenses.BudgetSummary | null>(null);
    let byDay = $state<expenses.ByDayBudget | null>(null);
    let categories = $state<expenses.CategoryBudgetRow[]>([]);
    let explist = $state<Expense[]>([]);

    let view = $state<View>('day');
    let unpaidOnly = $state(false);

    let sheetOpen = $state(false);
    let sheetMode = $state<'create' | 'edit'>('create');
    let sheetExpense = $state<Expense | null>(null);
    let sheetDefaultDate = $state<string | undefined>(undefined);
    let budgetOpen = $state(false);

    async function loadAll(tid: string) {
        if (!tid) return;
        try {
            const [t, s, d, c, list] = await Promise.all([
                trips.get(tid),
                expenses.summary(tid),
                expenses.byDayRollup(tid),
                expenses.byCategoryRollup(tid),
                expenses.byTrip(tid)
            ]);
            trip = t;
            summary = s;
            byDay = d;
            categories = c.categories;
            explist = list;
            everLoaded = true;
            loadError = false;
        } catch {
            // First-load failure surfaces an inline retry; later reloads keep prior data.
            if (!everLoaded) loadError = true;
        } finally {
            loaded = true;
        }
    }

    $effect(() => {
        const tid = tripId;
        void reloadSignal;
        loadAll(tid);
    });

    onMount(() => startLive(() => loadAll(tripId)));

    const home = $derived(summary?.homeCurrency ?? trip?.homeCurrency ?? 'EUR');
    const hasExpenses = $derived(explist.length > 0);

    function reload() {
        loadAll(tripId);
    }

    function retry() {
        loadError = false;
        loaded = false;
        loadAll(tripId);
    }

    function openAdd(date?: string) {
        sheetMode = 'create';
        sheetExpense = null;
        sheetDefaultDate = date;
        sheetOpen = true;
    }

    function openEdit(expense: Expense) {
        sheetMode = 'edit';
        sheetExpense = expense;
        sheetOpen = true;
    }

    async function togglePaid(expense: Expense) {
        try {
            await expenses.togglePaid(expense._id);
            reload();
        } catch {
            toast.error('Could not update the expense. Try again.');
        }
    }

    const TABS: { value: View; label: string }[] = [
        { value: 'day', label: 'By day' },
        { value: 'category', label: 'By category' },
        { value: 'list', label: 'List' }
    ];

    // Roving-tabindex arrow-key navigation for the cost-view tabs (WAI-ARIA tabs).
    function onViewKeydown(e: KeyboardEvent) {
        const idx = TABS.findIndex((t) => t.value === view);
        let next = idx;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % TABS.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + TABS.length) % TABS.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = TABS.length - 1;
        else return;
        e.preventDefault();
        view = TABS[next].value;
        document.getElementById(`costtab-${TABS[next].value}`)?.focus();
    }

    const segClass = (active: boolean) =>
        cn(
            'inline-flex min-h-touch items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            active ? 'bg-surface text-ink shadow-soft' : 'text-ink-muted hover:text-ink'
        );
</script>

{#if !loaded}
    <div class="space-y-4">
        <Skeleton class="h-40 w-full rounded-lg" />
        <Skeleton class="h-12 w-full rounded-lg" />
        <Skeleton class="h-24 w-full rounded-lg" />
        <Skeleton class="h-24 w-full rounded-lg" />
    </div>
{:else if loadError}
    <ErrorState title="Couldn't load costs" onretry={retry} />
{:else if summary}
    <div class="space-y-5">
        <SummaryHeader {summary} onEditBudget={() => (budgetOpen = true)} />

        <QuickAdd {tripId} homeCurrency={home} onsaved={reload} />

        {#if !hasExpenses}
            <div class="rounded-lg border border-dashed border-border bg-surface-sunken px-6 py-12 text-center">
                <Wallet class="mx-auto size-9 text-ink-muted" aria-hidden="true" />
                <h2 class="mt-3 text-lg font-semibold">No expenses yet</h2>
                <p class="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
                    Quick-add above, or add a detailed expense with currency, dates and budget links. Booking costs from flights and Reservations show up here automatically.
                </p>
                <Button class="mt-4" onclick={() => openAdd()}>
                    <Plus class="size-4" /> Add expense
                </Button>
            </div>
        {:else}
            <!-- View tabs + unpaid-only master toggle -->
            <div class="flex flex-wrap items-center justify-between gap-3">
                <div
                    class="inline-flex rounded-lg border border-border bg-surface-sunken p-1"
                    role="tablist"
                    aria-label="Cost views"
                >
                    {#each TABS as t (t.value)}
                        <button
                            type="button"
                            id={`costtab-${t.value}`}
                            role="tab"
                            aria-selected={view === t.value}
                            aria-controls="cost-panel"
                            tabindex={view === t.value ? 0 : -1}
                            onclick={() => (view = t.value)}
                            onkeydown={onViewKeydown}
                            class={segClass(view === t.value)}
                        >
                            {t.label}
                        </button>
                    {/each}
                </div>

                <button
                    type="button"
                    onclick={() => (unpaidOnly = !unpaidOnly)}
                    aria-pressed={unpaidOnly}
                    class={cn(
                        'inline-flex min-h-touch items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                        unpaidOnly
                            ? 'border-accent-terracotta bg-accent-terracotta text-white'
                            : 'border-border bg-surface text-ink-muted hover:text-ink'
                    )}
                >
                    Unpaid only
                </button>
            </div>

            <div id="cost-panel" role="tabpanel" aria-labelledby={`costtab-${view}`} tabindex="-1">
                {#if view === 'day'}
                    <ByDayView {byDay} {summary} {unpaidOnly} />
                {:else if view === 'category'}
                    <ByCategoryView {categories} homeCurrency={home} {summary} {unpaidOnly} />
                {:else if view === 'list'}
                    <ListView expenses={explist} homeCurrency={home} {unpaidOnly} onedit={openEdit} ontogglePaid={togglePaid} />
                {/if}
            </div>
        {/if}
    </div>
{/if}

<!-- Floating add button -->
{#if hasExpenses}
    <button
        type="button"
        onclick={() => openAdd()}
        aria-label="Add expense"
        class="fixed bottom-20 right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary-600 px-5 text-base font-medium text-white shadow-lg hover:bg-primary-700 active:scale-95"
    >
        <Plus />
        <span class="hidden sm:inline">Add expense</span>
    </button>
{/if}

<ExpenseSheet
    bind:open={sheetOpen}
    mode={sheetMode}
    {tripId}
    expense={sheetExpense}
    homeCurrency={home}
    defaultDate={sheetDefaultDate}
    onsaved={reload}
/>

<BudgetSheet bind:open={budgetOpen} {tripId} {trip} onsaved={reload} />
