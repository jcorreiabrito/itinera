<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { pushState, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { expenses, trips } from '$lib/db';
	import type { Expense, Trip } from '$lib/db';
	import { Plus, Wallet } from 'lucide-svelte';
	import { Button, ErrorState, Skeleton, toast } from '$lib/components/ui';
	import { getTripShellContext } from '$lib/trip-context';
	import { startLive } from '$lib/live';
	import { t, type TranslationKey } from '$lib/i18n.svelte';
	import { cn } from '$lib/utils';
	import {
		costsUrl,
		onlyTextFilterChanged,
		readCostsParams,
		type CostsPaidFilter,
		type CostsSort,
		type CostsView
	} from '$lib/utils/url-state';
	import SummaryHeader from './SummaryHeader.svelte';
	import PaceCard from './PaceCard.svelte';
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

	let loaded = $state(false);
	let loadError = $state(false);
	let everLoaded = false;
	let trip = $state<Trip | null>(null);
	let summary = $state<expenses.BudgetSummary | null>(null);
	let byDay = $state<expenses.ByDayBudget | null>(null);
	let categories = $state<expenses.CategoryBudgetRow[]>([]);
	let explist = $state<Expense[]>([]);

	/*
	 * Which view is showing, the unpaid-only toggle, the expense list's filters
	 * and the open expense are what a reload should come back to, so the URL
	 * carries them — read at initialisation, so the first frame is already the
	 * linked one, and mirrored back by the effect below.
	 *
	 * The list's own filters live here rather than in `ListView` because they
	 * outlive it: switching to another view unmounts the list, and its filters
	 * must survive both that and a reload.
	 */
	const fromUrl = readCostsParams(page.url.searchParams);
	let view = $state<CostsView>(fromUrl.view);
	let unpaidOnly = $state(fromUrl.unpaidOnly);
	let listSearch = $state(fromUrl.query);
	let listPaid = $state<CostsPaidFilter>(fromUrl.paid);
	let listSort = $state<CostsSort>(fromUrl.sort);

	/**
	 * The trip the URL's open expense has been applied for, if any. Reactive, not
	 * a plain flag: the URL-sync effect keys off it, and has to wake up when the
	 * first load finishes initialising.
	 */
	let initForId = $state('');

	let sheetOpen = $state(false);
	let sheetMode = $state<'create' | 'edit'>('create');
	let sheetExpense = $state<Expense | null>(null);
	let sheetDefaultDate = $state<string | undefined>(undefined);
	let budgetOpen = $state(false);

	/** The URL this pane owns, for the popstate guard in `onMount`. */
	const ownPath = $derived(resolve('/trip/[id]/costs', { id: tripId }));

	/**
	 * Reopen the expense a link points at.
	 *
	 * A reload — a phone reclaiming the tab, a shared link — should land the user
	 * back on the expense they were editing. An id that no longer names a live
	 * expense is ignored; the URL-sync effect drops it from the address bar.
	 */
	function openExpenseByUrlId(expenseId: string) {
		const target = explist.find((e) => e._id === expenseId);
		if (!target) return;
		sheetMode = 'edit';
		sheetExpense = target;
		sheetOpen = true;
	}

	/**
	 * Take the view state from a query string.
	 *
	 * Used for Back/Forward, which move between the history entries the effect
	 * below pushes: by the time the event fires the browser is already on the
	 * other URL, so applying it here is what makes Back show the previous view
	 * instead of leaving the current one on screen.
	 */
	function applyUrlState(params: URLSearchParams) {
		const state = readCostsParams(params);
		view = state.view;
		unpaidOnly = state.unpaidOnly;
		listSearch = state.query;
		listPaid = state.paid;
		listSort = state.sort;
		if (state.expense) openExpenseByUrlId(state.expense);
		// An edit sheet whose expense the URL no longer names was closed by Back.
		else if (sheetMode === 'edit') sheetOpen = false;
	}

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

			/*
			 * The expense in the URL can only be resolved once the expenses are
			 * here.
			 *
			 * Wrapped in `untrack` because this runs inside the load effect:
			 * reading `page.url` — or the list `openExpenseByUrlId` scans — as a
			 * tracked dependency would tie the fetch to state it then writes.
			 */
			if (initForId !== tid) {
				untrack(() => {
					const urlExpense = readCostsParams(page.url.searchParams).expense;
					if (urlExpense) openExpenseByUrlId(urlExpense);
				});
				initForId = tid;
			}

			everLoaded = true;
			loadError = false;
		} catch {
			if (!everLoaded) loadError = true;
		} finally {
			loaded = true;
		}
	}

	$effect(() => {
		const tid = tripId;
		void $reloadSignal;
		loadAll(tid);
	});

	/*
	 * Keep the address bar in step with what is on screen, so a view, the filters
	 * and the open expense can all be linked, bookmarked, shared and reloaded —
	 * the same shape as the itinerary's effect.
	 *
	 * The current URL is read from `window.location`, not from `page.url`: the
	 * latter would make this effect depend on its own writes, and the write
	 * would then have to be idempotent to terminate.
	 *
	 * Typing in the list's search box only *replaces* the current entry, so a
	 * five-letter search is not five Back presses; every other change is a
	 * deliberate one and pushes, so Back undoes it. The first pass normalises
	 * whatever the URL already said and replaces for the same reason.
	 */
	let urlNormalised = false;
	$effect(() => {
		const tid = tripId;
		const nextView = view;
		const unpaid = unpaidOnly;
		const query = listSearch;
		const paid = listPaid;
		const sort = listSort;
		// Only an *existing* expense has a URL of its own: the create sheet is a
		// transient form with nothing yet to point at.
		const expense = sheetOpen && sheetExpense ? sheetExpense._id : null;
		// Nothing to mirror until the URL has been read for this trip, open
		// expense and all.
		if (!tid || initForId !== tid) return;

		const next = costsUrl(window.location.href, {
			view: nextView,
			unpaidOnly: unpaid,
			query,
			paid,
			sort,
			expense
		});
		const current = `${window.location.pathname}${window.location.search}`;
		if (next === current) {
			urlNormalised = true;
			return;
		}
		/*
		 * Built from the live location rather than a route literal, so the path is
		 * already the resolved one and `resolve()` has nothing to add.
		 */
		/* eslint-disable svelte/no-navigation-without-resolve */
		if (urlNormalised && !onlyTextFilterChanged(current, next)) pushState(next, {});
		else replaceState(next, {});
		/* eslint-enable svelte/no-navigation-without-resolve */
		urlNormalised = true;
	});

	onMount(() => {
		const stopLive = startLive(() => loadAll(tripId));
		/*
		 * The pathname is checked before applying: a Back that leaves this page
		 * also fires here, and copying the next page's query string onto this
		 * pane's state would mirror it straight back into the address bar,
		 * fighting the navigation already under way.
		 */
		const onPopstate = () => {
			if (window.location.pathname !== ownPath) return;
			applyUrlState(new URLSearchParams(window.location.search));
		};
		window.addEventListener('popstate', onPopstate);
		return () => {
			stopLive();
			window.removeEventListener('popstate', onPopstate);
		};
	});

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
			toast.error(t('could_not_update_expense'));
		}
	}

	const TABS: { value: CostsView; labelKey: TranslationKey }[] = [
		{ value: 'day', labelKey: 'by_day' },
		{ value: 'category', labelKey: 'by_category' },
		{ value: 'list', labelKey: 'list' }
	];

	function onViewKeydown(e: KeyboardEvent) {
		const idx = TABS.findIndex((t) => t.value === view);
		let next = idx;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % TABS.length;
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
			next = (idx - 1 + TABS.length) % TABS.length;
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
	<ErrorState title={t('could_not_load_costs')} onretry={retry} />
{:else if summary}
	<div class="space-y-5">
		<SummaryHeader {summary} onEditBudget={() => (budgetOpen = true)} />

		{#if trip}
			<PaceCard {trip} expenses={explist} />
		{/if}

		<QuickAdd {tripId} homeCurrency={home} onsaved={reload} />

		{#if !hasExpenses}
			<div
				class="rounded-lg border border-dashed border-border bg-surface-sunken px-6 py-12 text-center"
			>
				<Wallet class="mx-auto size-9 text-ink-muted" aria-hidden="true" />
				<h2 class="mt-3 text-lg font-semibold">{t('no_expenses_yet')}</h2>
				<p class="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
					{t('no_expenses_desc')}
				</p>
				<Button class="mt-4" onclick={() => openAdd()}>
					<Plus class="size-4" />
					{t('add_expense')}
				</Button>
			</div>
		{:else}
			<!-- View tabs + unpaid-only master toggle -->
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div
					class="flex w-full rounded-lg border border-border bg-surface-sunken p-1 sm:inline-flex"
					role="tablist"
					aria-label={t('costs_views_label')}
				>
					{#each TABS as tab (tab.value)}
						<button
							type="button"
							id={`costtab-${tab.value}`}
							role="tab"
							aria-selected={view === tab.value}
							aria-controls="cost-panel"
							tabindex={view === tab.value ? 0 : -1}
							onclick={() => (view = tab.value)}
							onkeydown={onViewKeydown}
							class={cn(
								segClass(view === tab.value),
								'flex-1 justify-center px-1 text-center text-xs sm:text-sm'
							)}
						>
							{t(tab.labelKey)}
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
					{t('unpaid_only')}
				</button>
			</div>

			<div id="cost-panel" role="tabpanel" aria-labelledby={`costtab-${view}`} tabindex="-1">
				{#if view === 'day' && byDay}
					<ByDayView {byDay} {summary} {unpaidOnly} />
				{:else if view === 'category'}
					<ByCategoryView {categories} homeCurrency={home} {summary} {unpaidOnly} />
				{:else if view === 'list'}
					<!-- The list's filters are bound, not its own: they live in the URL. -->
					<ListView
						expenses={explist}
						homeCurrency={home}
						{unpaidOnly}
						travelerCount={summary.travelerCount}
						bind:search={listSearch}
						bind:paidFilter={listPaid}
						bind:sort={listSort}
						onedit={openEdit}
						ontogglePaid={togglePaid}
					/>
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
		aria-label={t('add_expense')}
		class="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary-600 px-5 text-base font-medium text-white shadow-lg hover:bg-primary-700 active:scale-95 lg:bottom-8"
	>
		<Plus />
		<span class="hidden sm:inline">{t('add_expense')}</span>
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
