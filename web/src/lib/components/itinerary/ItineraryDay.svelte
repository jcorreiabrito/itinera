<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { checklist, itinerary } from '$lib/db';
	import type { ChecklistItem, Destination, Flight, ItineraryItem, Reservation } from '$lib/db';
	import { ChevronDown, ListTodo, MapPin, Pencil, Plus, Sparkles, Star } from 'lucide-svelte';
	import { DateTime } from 'luxon';
	import { Button, Dialog, Field, Input, Select, Textarea, toast } from '$lib/components/ui';
	import { flagEmoji, formatMoney } from '$lib/format';
	import { getDestinationForDate } from '$lib/destinations';
	import { renderMarkdown } from '$lib/markdown';
	import { cn } from '$lib/utils';
	import { getRuntimeConfig, flagEnabled } from '$lib/config';
	import { fetchTripWeather, loadCachedWeather, type DayWeather } from '$lib/utils/weather';
	import { t } from '$lib/i18n.svelte';
	import { CATEGORY_META, CATEGORY_ORDER } from './categories';
	import TimelineEntryRow from './TimelineEntryRow.svelte';
	import MoveToDayDialog from './MoveToDayDialog.svelte';
	import DayFeasibility from './DayFeasibility.svelte';

	const feasibilityEnabled = flagEnabled('feasibility');

	interface Props {
		day: itinerary.DayTimeline;
		/** Bare trip ULID. */
		tripId: string;
		/** Trip days (ISO) for move-to-day. */
		dates: string[];
		destinations?: Destination[];
		homeCurrency?: string;
		travelerCount?: number;
		flightsById?: Map<string, Flight>;
		reservationsById?: Map<string, Reservation>;
		links: { flights: ResolvedPathname; reservations: ResolvedPathname };
		/** Open the full edit sheet for an existing item. */
		onedit: (item: ItineraryItem) => void;
		/** Re-query after a mutation. */
		onchanged: () => void;
	}

	let {
		day,
		tripId,
		dates,
		destinations = [],
		homeCurrency = 'EUR',
		travelerCount = 1,
		flightsById,
		reservationsById,
		links,
		onedit,
		onchanged
	}: Props = $props();

	const isIdeas = $derived(day.date === null);
	const heading = $derived.by(() => {
		if (!day.date) return t('unscheduled_ideas');
		const dt = DateTime.fromISO(day.date);
		return dt.isValid ? dt.toFormat('ccc d LLL') : day.date;
	});

	const activeDestination = $derived(
		day.date && destinations.length > 0 ? getDestinationForDate(day.date, destinations) : null
	);

	let dayWeather = $state<DayWeather | null>(null);

	$effect(() => {
		if (!day.date || !activeDestination?.lat || !activeDestination?.lng) {
			dayWeather = null;
			return;
		}
		const lat = activeDestination.lat;
		const lng = activeDestination.lng;
		const targetDate = day.date;

		const cached = loadCachedWeather(lat, lng);
		if (cached?.days?.[targetDate]) {
			dayWeather = cached.days[targetDate];
		}

		// A deployment with no route to the forecast service keeps showing the
		// cached forecast without a failing request on every day card.
		if (getRuntimeConfig().weatherEnabled) {
			fetchTripWeather(lat, lng).then((forecast) => {
				if (forecast?.days?.[targetDate]) {
					dayWeather = forecast.days[targetDate];
				}
			});
		}
	});

	const todosDone = $derived(day.todos.filter((t) => t.done).length);
	let todosOpen = $state(true);

	// Already in `order` sequence: `buildDay` sorts the all-day lane, and
	// `laneNeighbour` reads that same array to decide what "up" means.
	const allDayItems = $derived(day.allDay);

	// --- Day title + notes editor ----------------------------------------------
	let metaOpen = $state(false);
	let metaTitle = $state('');
	let metaNotes = $state('');
	let metaSaving = $state(false);

	function openMeta() {
		metaTitle = day.day?.title ?? '';
		metaNotes = day.day?.notes ?? '';
		metaOpen = true;
	}

	async function saveMeta() {
		if (!day.date) return;
		metaSaving = true;
		try {
			await itinerary.setDayMeta(tripId, day.date, {
				title: metaTitle.trim() || undefined,
				notes: metaNotes.trim() || undefined
			});
			metaOpen = false;
			onchanged();
		} catch {
			toast.error(t('could_not_save_day_details'));
		} finally {
			metaSaving = false;
		}
	}

	// --- Daily to-dos ----------------------------------------------------------
	async function toggleTodo(todo: ChecklistItem) {
		try {
			await checklist.toggle(todo._id);
			onchanged();
		} catch {
			toast.error(t('could_not_update_todo'));
		}
	}

	function todoLabel(todo: ChecklistItem): string {
		return `${todo.text ?? t('to_do')}, ${todo.done ? t('done') : t('not_done')}`;
	}

	// --- Reorder (accessible move up/down) ------------------------------------
	// Which item is "next" is `laneNeighbour`'s call, not this component's, so the
	// buttons and the lane the user is looking at cannot disagree.

	function canMove(item: ItineraryItem, dir: 'up' | 'down'): boolean {
		return itinerary.laneNeighbour(day, item, dir) !== null;
	}

	async function move(item: ItineraryItem, dir: 'up' | 'down') {
		const other = itinerary.laneNeighbour(day, item, dir);
		if (!other) return;
		try {
			await itinerary.swapPlacement(item, other);
			onchanged();
		} catch {
			toast.error(t('could_not_reorder'));
		}
	}

	// --- Move to day -----------------------------------------------------------
	let moveOpen = $state(false);
	let moveItem = $state<ItineraryItem | null>(null);

	function openMove(item: ItineraryItem) {
		moveItem = item;
		moveOpen = true;
	}

	async function doMoveDate(date: string | null) {
		if (!moveItem) return;
		try {
			await itinerary.moveToDay(moveItem._id, date);
			onchanged();
		} catch {
			toast.error(t('could_not_move_activity'));
		}
	}

	// --- Add as expense / delete (from row menu) ------------------------------
	async function addExpense(item: ItineraryItem) {
		try {
			const exp = await itinerary.addExpense(item._id);
			if (exp) toast.success(t('added_to_costs'));
			else toast.error(t('add_estimated_cost_first'));
			onchanged();
		} catch {
			toast.error(t('could_not_add_expense'));
		}
	}

	async function removeItem(item: ItineraryItem) {
		try {
			await itinerary.softDelete(item._id);
			toast.success(t('activity_removed'), {
				action: {
					label: t('undo'),
					onClick: async () => {
						try {
							await itinerary.restore(item._id);
							onchanged();
						} catch {
							toast.error(t('could_not_undo'));
						}
					}
				}
			});
			onchanged();
		} catch {
			toast.error(t('could_not_remove_activity'));
		}
	}

	// --- Quick add -------------------------------------------------------------
	let qTitle = $state('');
	let qAllDay = $state(false);
	let qTime = $state('');
	let qCategory = $state('');
	let qSaving = $state(false);

	async function quickAdd() {
		const title = qTitle.trim();
		if (!title) return;
		qSaving = true;
		try {
			await itinerary.create(tripId, {
				title,
				date: day.date,
				allDay: qAllDay,
				startTime: qAllDay ? undefined : qTime || undefined,
				category: qCategory ? (qCategory as ItineraryItem['category']) : undefined
			});
			qTitle = '';
			onchanged();
		} catch {
			toast.error(t('could_not_add_activity'));
		} finally {
			qSaving = false;
		}
	}

	const isEmpty = $derived(day.allDay.length === 0 && day.timed.length === 0);
</script>

<section aria-label={heading} class="space-y-4">
	<!-- Day header -->
	<header class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-2">
				{#if isIdeas}<Sparkles class="size-5 text-accent-terracotta" aria-hidden="true" />{/if}
				<h2 class="font-serif text-xl font-semibold text-ink">{heading}</h2>
				{#if activeDestination}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-primary-300 bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-800"
					>
						<MapPin class="size-3 text-primary-600" />
						{#if flagEmoji(activeDestination.country)}<span aria-hidden="true"
								>{flagEmoji(activeDestination.country)}</span
							>{/if}
						{activeDestination.name}
					</span>
				{/if}
				{#if dayWeather}
					<span
						class="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800"
						title={dayWeather.description}
					>
						<span>{dayWeather.icon}</span>
						<span>{dayWeather.maxTemp}° / {dayWeather.minTemp}°C</span>
					</span>
				{/if}
			</div>
			{#if !isIdeas}
				{#if day.day?.title}
					<p class="mt-0.5 text-sm font-medium text-primary-700">{day.day.title}</p>
				{/if}
				{#if day.day?.notes}
					<div class="mt-1.5 space-y-1.5 text-sm text-ink-muted">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes all user text before adding allowlisted tags (see $lib/markdown.ts) -->
						{@html renderMarkdown(day.day.notes)}
					</div>
				{/if}
			{:else}
				<p class="mt-0.5 text-sm text-ink-muted">{t('capture_ideas_hint')}</p>
			{/if}
		</div>
		{#if !isIdeas}
			<button
				type="button"
				onclick={openMeta}
				class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [&_svg]:size-3.5"
			>
				<Pencil />
				{day.day?.title || day.day?.notes ? t('edit_day') : t('add_title')}
			</button>
		{/if}
	</header>

	<!-- Daily to-dos -->
	{#if !isIdeas && day.todos.length > 0}
		<div class="rounded-lg border border-border bg-surface-sunken">
			<button
				type="button"
				onclick={() => (todosOpen = !todosOpen)}
				aria-expanded={todosOpen}
				class="flex min-h-touch w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
			>
				<span class="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
					<ListTodo class="size-4 text-primary-700" />
					{t('daily_todos')}
					<span class="text-ink-muted"
						>({t('todos_progress', {
							done: String(todosDone),
							total: String(day.todos.length)
						})})</span
					>
				</span>
				<ChevronDown
					class={cn('size-4 text-ink-muted transition-transform', todosOpen && '-rotate-180')}
				/>
			</button>
			{#if todosOpen}
				<ul class="space-y-0.5 px-3 pb-2.5">
					{#each day.todos as todo (todo._id)}
						<li>
							<label
								class="flex min-h-touch cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-surface"
							>
								<input
									type="checkbox"
									checked={todo.done}
									onchange={() => toggleTodo(todo)}
									aria-label={todoLabel(todo)}
									class="size-5 shrink-0 rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30"
								/>
								<span class={cn('min-w-0 flex-1', todo.done && 'text-ink-muted line-through')}>
									{todo.text ?? t('to_do')}
								</span>
								{#if todo.important}
									<Star
										class="size-3.5 shrink-0 fill-accent-amber text-accent-amber"
										aria-label={t('important')}
									/>
								{/if}
							</label>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<!-- All-day lane -->
	{#if allDayItems.length > 0}
		<div>
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
				{t('all_day')}
			</h3>
			<ul class="space-y-2">
				{#each allDayItems as item (item._id)}
					<TimelineEntryRow
						entry={{ kind: 'item', minutes: null, order: item.order ?? 0, item }}
						{links}
						{flightsById}
						{reservationsById}
						{homeCurrency}
						{travelerCount}
						canMoveUp={canMove(item, 'up')}
						canMoveDown={canMove(item, 'down')}
						{onedit}
						onmoveup={(i) => move(i, 'up')}
						onmovedown={(i) => move(i, 'down')}
						onmovetoday={openMove}
						onaddexpense={addExpense}
						ondelete={removeItem}
					/>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Day feasibility: a warning sits above the timeline it is about -->
	{#if feasibilityEnabled}
		<DayFeasibility {day} {onedit} />
	{/if}

	<!-- Timed lane (ordered list = the timeline) -->
	{#if day.timed.length > 0}
		<ol
			class="relative space-y-2 before:absolute before:bottom-3 before:left-[4.75rem] before:top-3 before:w-px before:bg-border before:content-['']"
		>
			{#each day.timed as entry, i (entry.item?._id ?? `${entry.kind}-${i}`)}
				<TimelineEntryRow
					{entry}
					{links}
					{flightsById}
					{reservationsById}
					{homeCurrency}
					{travelerCount}
					canMoveUp={entry.item ? canMove(entry.item, 'up') : false}
					canMoveDown={entry.item ? canMove(entry.item, 'down') : false}
					{onedit}
					onmoveup={(it) => move(it, 'up')}
					onmovedown={(it) => move(it, 'down')}
					onmovetoday={openMove}
					onaddexpense={addExpense}
					ondelete={removeItem}
				/>
			{/each}
		</ol>
	{/if}

	{#if isEmpty}
		<div class="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center">
			<p class="text-sm text-ink-muted">
				{isIdeas ? t('no_ideas_yet') : t('nothing_planned_yet')}
			</p>
		</div>
	{/if}

	<!-- Day subtotal -->
	{#if !isIdeas}
		<div
			class="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
		>
			<span class="font-medium text-ink-muted">{t('day_subtotal')}</span>
			{#if day.subtotal.spent > 0}
				<div class="text-right">
					<span class="font-semibold tabular-nums text-ink"
						>{formatMoney(day.subtotal.spent, homeCurrency, { decimals: true })}</span
					>
					{#if travelerCount > 1}
						<span class="ml-1 text-xs font-normal text-ink-muted"
							>({formatMoney(day.subtotal.spent / travelerCount, homeCurrency, {
								decimals: true
							})}/p.p.)</span
						>
					{/if}
				</div>
			{:else}
				<span class="text-ink-muted">{t('no_costs_yet')}</span>
			{/if}
		</div>
		{#if day.subtotal.missingRateCount > 0}
			<p class="mt-2 text-xs text-warning">
				{day.subtotal.missingRateCount}
				{t(day.subtotal.missingRateCount === 1 ? 'cost_excluded_one' : 'costs_excluded_many')}
			</p>
		{/if}
	{/if}

	<!-- Quick add -->
	<form
		class="rounded-lg border border-border bg-surface p-3"
		onsubmit={(e) => {
			e.preventDefault();
			quickAdd();
		}}
	>
		<label for="quick-add-{tripId}" class="sr-only">{t('add_activity')}</label>
		<div class="flex items-center gap-2">
			<Input
				id="quick-add-{tripId}"
				class="flex-1"
				value={qTitle}
				placeholder={isIdeas ? t('add_an_idea') : t('add_an_activity')}
				oninput={(e) => (qTitle = e.currentTarget.value)}
			/>
			<Button type="submit" size="sm" disabled={qSaving || !qTitle.trim()}>
				<Plus class="size-4" />
				{t('add')}
			</Button>
		</div>
		<div class="mt-2.5 flex flex-wrap items-center gap-1">
			<label class="inline-flex items-center gap-2 text-sm text-ink">
				<input
					type="checkbox"
					checked={qAllDay}
					onchange={(e) => (qAllDay = e.currentTarget.checked)}
					class="size-4 rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30"
				/>
				{t('all_day')}
			</label>
			{#if !qAllDay}
				<label class="inline-flex items-center gap-2 text-sm text-ink-muted">
					<span class="sr-only">{t('start_time')}</span>
					<input
						type="time"
						class="h-9 w-32"
						value={qTime}
						oninput={(e) => (qTime = e.currentTarget.value)}
					/>
				</label>
			{/if}
			<label class="inline-flex items-center gap-2 text-sm text-ink-muted">
				<span class="sr-only">{t('category')}</span>
				<Select
					class="h-9 w-40"
					value={qCategory}
					onchange={(e) => (qCategory = e.currentTarget.value)}
				>
					<option value="">{t('no_category')}</option>
					{#each CATEGORY_ORDER as cat (cat)}
						<option value={cat}>{CATEGORY_META[cat].label}</option>
					{/each}
				</Select>
			</label>
		</div>
	</form>
</section>

<!-- Day details dialog -->
<Dialog bind:open={metaOpen} title={t('day_details')} description={!isIdeas ? undefined : heading}>
	<div class="flex flex-col gap-4">
		<Field label={t('title')} for="day-title">
			<Input
				id="day-title"
				value={metaTitle}
				placeholder={t('day_title_placeholder')}
				oninput={(e) => (metaTitle = e.currentTarget.value)}
			/>
		</Field>
		<Field label={t('notes')} for="day-notes" hint={t('markdown_supported')}>
			<Textarea
				id="day-notes"
				rows={3}
				value={metaNotes}
				placeholder={t('day_notes_placeholder')}
				oninput={(e) => (metaNotes = e.currentTarget.value)}
			/>
		</Field>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (metaOpen = false)} disabled={metaSaving}
			>{t('cancel')}</Button
		>
		<Button onclick={saveMeta} disabled={metaSaving}>{metaSaving ? t('saving') : t('save')}</Button>
	{/snippet}
</Dialog>

<!-- Move to day dialog -->
<MoveToDayDialog
	bind:open={moveOpen}
	{dates}
	current={moveItem?.date ?? null}
	title={moveItem?.title}
	onmove={doMoveDate}
/>
