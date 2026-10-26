<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { ResolvedPathname } from '$app/types';
	import { checklist, itinerary, trash } from '$lib/db';
	import type {
		ChecklistItem,
		Destination,
		Flight,
		ItineraryCategory,
		ItineraryItem,
		Reservation
	} from '$lib/db';
	import {
		ChevronDown,
		CloudRain,
		Footprints,
		ListChecks,
		ListTodo,
		MapPin,
		Pencil,
		Plus,
		Sparkles,
		Star
	} from 'lucide-svelte';
	import { DateTime } from 'luxon';
	import { Badge, Button, Dialog, Field, Input, Select, Textarea, toast } from '$lib/components/ui';
	import { flagEmoji, formatMoney, formatWeekdayDate } from '$lib/format';
	import { getDestinationForDate } from '$lib/destinations';
	import { renderMarkdown } from '$lib/markdown';
	import { hasCoordinates, optimiseDayRoute, type RouteStop } from '$lib/route';
	import {
		classifyAxis,
		dropInsertionIndex,
		insertionToIndex,
		moveItem as moveLaneItem
	} from '$lib/gestures';
	import { cn } from '$lib/utils';
	import { getRuntimeConfig, flagEnabled } from '$lib/config';
	import {
		fetchTripWeather,
		loadCachedWeather,
		type DayWeather,
		type WeatherForecast
	} from '$lib/utils/weather';
	import { t } from '$lib/i18n.svelte';
	import { CATEGORY_META, CATEGORY_ORDER } from './categories';
	import TimelineEntryRow from './TimelineEntryRow.svelte';
	import MoveToDayDialog from './MoveToDayDialog.svelte';
	import DayFeasibility from './DayFeasibility.svelte';
	import BatchActionBar from './BatchActionBar.svelte';
	import BatchSelectionRow from './BatchSelectionRow.svelte';
	import MoveOutdoorDialog from './MoveOutdoorDialog.svelte';
	import OptimiseRouteDialog from './OptimiseRouteDialog.svelte';
	import { dayItems } from './day-status';
	import { moveableOutdoorItems, planDriestDay, type DriestPlan } from './weather-plan';
	import {
		allSelected as allIdsSelected,
		selectedInOrder,
		summarizeBatch,
		toggleSelected,
		type BatchSummary
	} from './batch-selection';

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
	let weatherByDate = $state<Record<string, DayWeather>>({});

	/**
	 * The selected day and the three days either side, clipped to the trip.
	 * A fortnight away is a different plan, not a drier alternative to today.
	 */
	const weatherWindowDates = $derived.by(() => {
		if (!day.date) return [];
		const index = dates.indexOf(day.date);
		if (index < 0) return [day.date];
		return dates.slice(Math.max(0, index - 3), Math.min(dates.length, index + 4));
	});

	const outdoorItems = $derived(moveableOutdoorItems(dayItems(day)));

	/** A route stop from an item; the location is optional until one is set. */
	function stopOf(item: ItineraryItem): RouteStop {
		return { id: item._id, lat: item.location?.lat, lng: item.location?.lng };
	}

	$effect(() => {
		const targetDate = day.date;
		const window = weatherWindowDates;
		if (!targetDate || window.length === 0) {
			dayWeather = null;
			weatherByDate = {};
			return;
		}

		const locations: { date: string; lat: number; lng: number }[] = [];
		const cached: Record<string, DayWeather> = {};
		for (const date of window) {
			const destination = getDestinationForDate(date, destinations);
			const lat = destination?.lat;
			const lng = destination?.lng;
			if (lat == null || lng == null) continue;
			locations.push({ date, lat, lng });
			const entry = loadCachedWeather(lat, lng)?.days?.[date];
			if (entry) cached[date] = entry;
		}
		weatherByDate = cached;
		dayWeather = cached[targetDate] ?? null;

		/*
		 * A deployment with no route to the forecast service, and the server
		 * render itself, must never open a request. The cache above is still
		 * read, so a previously fetched forecast keeps showing.
		 */
		if (typeof window === 'undefined' || !getRuntimeConfig().weatherEnabled) return;

		// Only the selected day always needs fresh weather. Nearby days are
		// fetched only when there is something the rain could move.
		const wanted: Record<string, { lat: number; lng: number }> = {};
		for (const { date, lat, lng } of locations) {
			if (date !== targetDate && outdoorItems.length === 0) continue;
			wanted[`${lat},${lng}`] = { lat, lng };
		}
		const keys = Object.keys(wanted);
		if (keys.length === 0) return;

		let cancelled = false;
		void Promise.all(
			keys.map((key) =>
				fetchTripWeather(wanted[key].lat, wanted[key].lng).then((forecast) => ({ key, forecast }))
			)
		).then((results) => {
			if (cancelled) return;
			const forecasts: Record<string, WeatherForecast | null> = {};
			for (const { key, forecast } of results) forecasts[key] = forecast;
			const merged: Record<string, DayWeather> = { ...cached };
			for (const { date, lat, lng } of locations) {
				const entry = forecasts[`${lat},${lng}`]?.days?.[date];
				if (entry) merged[date] = entry;
			}
			weatherByDate = merged;
			dayWeather = merged[targetDate] ?? null;
		});

		return () => {
			cancelled = true;
		};
	});

	const weatherLabel = $derived.by(() => {
		const forecast = dayWeather;
		if (!forecast) return '';
		const parts = [
			t('weather_temp_range', { min: String(forecast.minTemp), max: String(forecast.maxTemp) })
		];
		if (forecast.precipitationProbability != null) {
			parts.push(
				t('weather_precip_chance', {
					p: String(Math.round(forecast.precipitationProbability))
				})
			);
		}
		if (forecast.precipitationSum != null && forecast.precipitationSum > 0) {
			parts.push(t('weather_precip_amount', { mm: String(forecast.precipitationSum) }));
		}
		return t('weather_day_summary', { summary: parts.join(', ') });
	});

	const driestPlan = $derived.by((): DriestPlan => {
		if (!day.date) return { current: null, target: null };
		return planDriestDay(day.date, weatherWindowDates, weatherByDate);
	});

	// At zero chance nothing can be drier, so the action would have nothing to
	// say; above zero the dialog may still report that the nearby days are wetter.
	const currentChance = $derived(driestPlan.current?.precipitationProbability ?? null);
	const canMoveOutdoor = $derived(
		outdoorItems.length > 0 && currentChance != null && currentChance > 0
	);

	// --- Walking order ---------------------------------------------------------
	// Only the untimed lane is reordered: a start time is the signal that a stop
	// belongs to a booking, and all-day items live in their own lane.
	const routeItems = $derived(
		day.timed.flatMap((entry) =>
			entry.kind === 'item' && entry.item && !entry.item.startTime ? [entry.item] : []
		)
	);
	const routePlan = $derived.by(() => {
		const stops = routeItems.map(stopOf);
		const located = stops.filter((stop) => hasCoordinates(stop));
		if (located.length < 3) return null;
		return optimiseDayRoute(stops);
	});
	const orderedRouteItems = $derived.by(() => {
		if (!routePlan) return [];
		const byId = new Map(routeItems.map((item) => [item._id, item]));
		return routePlan.order.flatMap((id) => {
			const item = byId.get(id);
			return item ? [item] : [];
		});
	});

	let driestOpen = $state(false);
	let driestBusy = $state(false);
	let routeOpen = $state(false);
	let routeBusy = $state(false);

	const todosDone = $derived(day.todos.filter((t) => t.done).length);
	let todosOpen = $state(true);

	// --- Reorder lanes ---------------------------------------------------------
	// All-day items are ordered by `order`. In the timed lane only the untimed
	// item entries at the head are manually ordered: a start time means the clock
	// decides, so those rows get no handle and never move past an untimed one.

	type UntimedEntry = itinerary.TimelineEntry & { item: ItineraryItem };

	function isUntimedItemEntry(entry: itinerary.TimelineEntry): entry is UntimedEntry {
		return entry.kind === 'item' && entry.item !== undefined && entry.minutes === null;
	}

	interface OptimisticOrder {
		ids: string[];
		/** The lane signature the parent had when the write started. */
		base: string;
	}

	let optimisticAllDay = $state<OptimisticOrder | null>(null);
	let optimisticUntimed = $state<OptimisticOrder | null>(null);

	const untimedEntries = $derived(day.timed.filter(isUntimedItemEntry));
	const allDaySignature = $derived(day.allDay.map((item) => item._id).join('|'));
	const untimedSignature = $derived(untimedEntries.map((entry) => entry.item._id).join('|'));

	function orderByIds(items: readonly ItineraryItem[], ids?: string[]): ItineraryItem[] {
		if (!ids) return [...items];
		const byId = new Map(items.map((item) => [item._id, item]));
		const ordered = ids.flatMap((id) => {
			const item = byId.get(id);
			return item ? [item] : [];
		});
		const seen = new Set(ids);
		for (const item of items) if (!seen.has(item._id)) ordered.push(item);
		return ordered;
	}

	function orderEntries(entries: readonly UntimedEntry[], ids?: string[]): UntimedEntry[] {
		if (!ids) return [...entries];
		const byId = new Map(entries.map((entry) => [entry.item._id, entry]));
		const ordered = ids.flatMap((id) => {
			const entry = byId.get(id);
			return entry ? [entry] : [];
		});
		const seen = new Set(ids);
		for (const entry of entries) if (!seen.has(entry.item._id)) ordered.push(entry);
		return ordered;
	}

	const allDayLane = $derived(orderByIds(day.allDay, optimisticAllDay?.ids));
	const untimedLane = $derived(orderEntries(untimedEntries, optimisticUntimed?.ids));

	/*
	 * The untimed rows share their `<ol>` with the timed ones. Replacing only the
	 * slots they occupy keeps flights and reservations where `buildDay` put them
	 * while the optimistic order is on screen.
	 */
	const timelineEntries = $derived.by(() => {
		const queue = [...untimedLane];
		return day.timed.map((entry) => (isUntimedItemEntry(entry) ? (queue.shift() ?? entry) : entry));
	});

	// Clear the optimistic list once the parent reload has moved the lane: a
	// different signature means the timeline we were waiting for (or a newer one)
	// arrived, so the props are the truth again.
	$effect(() => {
		const signature = allDaySignature;
		if (optimisticAllDay && signature !== optimisticAllDay.base) optimisticAllDay = null;
	});
	$effect(() => {
		const signature = untimedSignature;
		if (optimisticUntimed && signature !== optimisticUntimed.base) optimisticUntimed = null;
	});

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
			void announce(t('gestures_reordered', { title: item.title ?? t('untitled') }));
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

	// --- Weather-aware planning ------------------------------------------------
	async function moveOutdoorItems() {
		const target = driestPlan.target;
		if (!target || outdoorItems.length === 0 || driestBusy) return;
		driestBusy = true;
		try {
			await Promise.all(
				outdoorItems.map((item) => itinerary.moveToDay(item._id, target.date, item.order ?? 0))
			);
			const n = String(outdoorItems.length);
			toast.success(
				t(outdoorItems.length === 1 ? 'weather_driest_moved_one' : 'weather_driest_moved_many', {
					n,
					date: formatWeekdayDate(target.date)
				})
			);
			driestOpen = false;
			onchanged();
		} catch {
			toast.error(t('weather_driest_failed'));
		} finally {
			driestBusy = false;
		}
	}

	// --- Walking order ---------------------------------------------------------
	async function applyRouteOrder() {
		const plan = routePlan;
		if (!plan || routeBusy) return;
		routeBusy = true;
		try {
			await itinerary.setOrder(plan.order.map((id, order) => ({ id, order })));
			toast.success(t('route_optimise_applied'));
			routeOpen = false;
			onchanged();
		} catch {
			toast.error(t('route_optimise_failed'));
		} finally {
			routeBusy = false;
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

	// --- Multi-select and batch actions ---------------------------------------
	const items = $derived(dayItems(day));
	const itemIds = $derived(items.map((item) => item._id));

	let selecting = $state(false);
	let selectedIds = $state<ReadonlySet<string>>(new Set());
	let batchBusy = $state(false);
	let batchMoveOpen = $state(false);
	let batchDeleteOpen = $state(false);
	let sectionEl = $state<HTMLElement>();

	const selectedIdsInOrder = $derived(selectedInOrder(selectedIds, itemIds));
	const selectedCount = $derived(selectedIdsInOrder.length);
	const everythingSelected = $derived(allIdsSelected(selectedIds, itemIds));
	const batchSelectedLabel = $derived(
		t(selectedCount === 1 ? 'batch_selected_one' : 'batch_selected_many', {
			n: String(selectedCount)
		})
	);
	const batchDeleteTitle = $derived(
		selectedCount === 1
			? t('batch_delete_title_one', { n: String(selectedCount) })
			: t('batch_delete_title_many', { n: String(selectedCount) })
	);

	// The route remounts this component when the day changes, but a prop swap in
	// isolation (tests, future callers) must not carry a selection to a new day
	// or trip.
	let selectionKey: string | null = null;
	$effect(() => {
		const key = `${tripId}:${day.date ?? 'ideas'}`;
		if (key === selectionKey) return;
		const hadKey = selectionKey !== null;
		selectionKey = key;
		if (!hadKey) return;
		selecting = false;
		selectedIds = new Set();
	});

	async function enterSelection() {
		selecting = true;
		selectedIds = new Set();
		// The Select button is replaced by Done, so hand focus to the first row
		// rather than letting it fall back to the document body.
		await tick();
		sectionEl?.querySelector<HTMLInputElement>('[data-batch-checkbox]')?.focus();
	}

	async function exitSelection() {
		const wasSelecting = selecting;
		selecting = false;
		selectedIds = new Set();
		if (!wasSelecting) return;
		await tick();
		sectionEl?.querySelector<HTMLButtonElement>('[data-batch-select]')?.focus();
	}

	function toggleItem(id: string, on: boolean) {
		selectedIds = toggleSelected(selectedIds, id, on);
	}

	function selectEveryItem() {
		selectedIds = new Set(itemIds);
	}

	function clearSelection() {
		selectedIds = new Set();
	}

	function onSelectionKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !selecting) return;
		// A dialog owns Escape while it is open; closing it must not also drop
		// the selection underneath.
		if (document.querySelector('dialog[open]')) return;
		event.preventDefault();
		event.stopPropagation();
		exitSelection();
	}

	type BatchVerb = 'move' | 'categorise' | 'duplicate' | 'delete';

	function reportBatch(verb: BatchVerb, summary: BatchSummary, undo?: () => Promise<void>) {
		if (summary.failed > 0) {
			const message = t('batch_partial', {
				succeeded: String(summary.succeeded),
				total: String(summary.total),
				failed: String(summary.failed)
			});
			if (summary.succeeded === 0) toast.error(message);
			else toast.warning(message);
			return;
		}

		const n = String(summary.succeeded);
		const options = undo ? { action: { label: t('undo'), onClick: undo } } : undefined;
		if (verb === 'move') {
			toast.success(
				t(summary.succeeded === 1 ? 'batch_moved_one' : 'batch_moved_many', { n }),
				options
			);
		} else if (verb === 'categorise') {
			toast.success(
				t(summary.succeeded === 1 ? 'batch_categorised_one' : 'batch_categorised_many', { n }),
				options
			);
		} else if (verb === 'duplicate') {
			toast.success(
				t(summary.succeeded === 1 ? 'batch_duplicated_one' : 'batch_duplicated_many', { n }),
				options
			);
		} else {
			toast.success(
				t(summary.succeeded === 1 ? 'batch_deleted_one' : 'batch_deleted_many', { n }),
				options
			);
		}
	}

	function pickedItems(): ItineraryItem[] {
		const byId = new Map(items.map((item) => [item._id, item]));
		return selectedIdsInOrder.flatMap((id) => {
			const item = byId.get(id);
			return item ? [item] : [];
		});
	}

	async function runBatch(
		verb: BatchVerb,
		work: (item: ItineraryItem) => Promise<unknown>,
		undo?: () => Promise<void>
	) {
		if (batchBusy) return;
		const picked = pickedItems();
		if (picked.length === 0) return;

		batchBusy = true;
		try {
			// `Promise.resolve().then` turns a synchronous throw inside `work` into a
			// rejection too, so one bad item still leaves the other writes reported.
			const results = await Promise.allSettled(
				picked.map((item) => Promise.resolve().then(() => work(item)))
			);
			reportBatch(verb, summarizeBatch(results), undo);
			exitSelection();
			onchanged();
		} finally {
			batchBusy = false;
		}
	}

	function openBatchMove() {
		if (selectedCount > 0) batchMoveOpen = true;
	}

	async function moveSelectedTo(date: string | null) {
		await runBatch('move', (item) => itinerary.moveToDay(item._id, date, item.order ?? 0));
	}

	async function categoriseSelected(category: ItineraryCategory) {
		await runBatch('categorise', (item) => itinerary.update(item._id, { category }));
	}

	async function duplicateSelected() {
		await runBatch('duplicate', (item) =>
			itinerary.create(tripId, {
				title: item.title ? `${item.title} ${t('batch_copy_suffix')}` : '',
				date: item.date ?? null,
				allDay: item.allDay,
				startTime: item.startTime,
				endTime: item.endTime,
				category: item.category,
				location: item.location,
				notes: item.notes,
				linkedFlightId: item.linkedFlightId,
				linkedReservationId: item.linkedReservationId,
				estCost: item.estCost,
				currency: item.currency,
				order: item.order ?? 0
			})
		);
	}

	function openBatchDelete() {
		if (selectedCount > 0) batchDeleteOpen = true;
	}

	async function deleteSelected() {
		batchDeleteOpen = false;
		// Delete is a move to Trash, so the toast can offer the same one-tap undo
		// the single-row delete and the checklist use. The ids are captured before
		// the batch runs because the rows leave the day on reload.
		const removed = pickedItems().map((item) => item._id);
		await runBatch(
			'delete',
			(item) => itinerary.softDelete(item._id),
			async () => {
				try {
					await trash.restoreMany(removed);
					toast.success(
						t(removed.length === 1 ? 'restored_single' : 'restored_plural', {
							n: String(removed.length)
						})
					);
					onchanged();
				} catch {
					toast.error(t('could_not_restore'));
				}
			}
		);
	}

	// --- Pointer drag (reorder and cross-day) ---------------------------------
	/*
	 * Rows are dragged from their handle only. A row-wide long-press cannot
	 * coexist with native vertical scrolling in Pointer Events, so the handle is
	 * both the touch target and the keyboard target: arrows reorder through the
	 * same `move()` path as the row menu.
	 */

	type DragLane = 'allDay' | 'untimed';

	interface DragSession {
		item: ItineraryItem;
		lane: DragLane;
		pointerId: number;
		handle: HTMLElement;
		row: HTMLElement;
		rowWidth: number;
		startX: number;
		startY: number;
		lastX: number;
		lastY: number;
		grabX: number;
		grabY: number;
		active: boolean;
		preview: HTMLElement | null;
		target: HTMLElement | null;
	}

	const DRAG_THRESHOLD = 6;
	const AUTOSCROLL_EDGE = 80;
	const AUTOSCROLL_MAX_STEP = 18;
	const DRAGGING_CLASS = 'gesture-dragging';
	const SOURCE_CLASS = 'gesture-drag-source';
	const PREVIEW_CLASS = 'gesture-drag-preview';
	const DROP_TARGET_CLASS = 'gesture-drop-target';

	let drag: DragSession | null = null;
	let previewFrame = 0;
	let scrollFrame = 0;
	let clickGuard: { handler: (event: Event) => void; timer: number } | null = null;
	let announcement = $state('');
	let announcementRun = 0;

	async function announce(message: string) {
		const run = ++announcementRun;
		announcement = '';
		await tick();
		if (run === announcementRun) announcement = message;
	}

	function laneRows(lane: DragLane): HTMLElement[] {
		if (!sectionEl) return [];
		return Array.from(sectionEl.querySelectorAll<HTMLElement>(`[data-drag-lane="${lane}"]`));
	}

	function laneIds(lane: DragLane): string[] {
		if (lane === 'allDay') return allDayLane.map((item) => item._id);
		return untimedLane.map((entry) => entry.item._id);
	}

	function findDropTarget(x: number, y: number): HTMLElement | null {
		if (typeof document === 'undefined') return null;
		return document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-date]') ?? null;
	}

	function beginDrag(event: PointerEvent, item: ItineraryItem, lane: DragLane) {
		if (selecting || drag) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		if (!event.isPrimary) return;

		const handle = event.currentTarget;
		if (!(handle instanceof HTMLElement)) return;
		const row = handle.closest<HTMLElement>('[data-drag-lane]');
		if (!row) return;

		const rect = row.getBoundingClientRect();
		drag = {
			item,
			lane,
			pointerId: event.pointerId,
			handle,
			row,
			rowWidth: rect.width,
			startX: event.clientX,
			startY: event.clientY,
			lastX: event.clientX,
			lastY: event.clientY,
			grabX: event.clientX - rect.left,
			grabY: event.clientY - rect.top,
			active: false,
			preview: null,
			target: null
		};

		handle.focus({ preventScroll: true });
		window.addEventListener('pointermove', onDragMove, { passive: true });
		window.addEventListener('pointerup', onDragEnd);
		window.addEventListener('pointercancel', onDragCancel);
		window.addEventListener('keydown', onDragKeyDown, true);
	}

	function activateDrag(session: DragSession) {
		session.active = true;
		try {
			session.handle.setPointerCapture(session.pointerId);
		} catch {
			// The pointer may already be gone; the window listeners still finish it.
		}
		document.body.classList.add(DRAGGING_CLASS);
		session.row.classList.add(SOURCE_CLASS);

		const preview = session.row.cloneNode(true) as HTMLElement;
		preview.removeAttribute('data-drag-lane');
		preview.setAttribute('aria-hidden', 'true');
		preview.setAttribute('inert', '');
		preview.classList.remove(SOURCE_CLASS);
		preview.classList.add(PREVIEW_CLASS);
		/*
		 * Written inline rather than by a utility class: the clone still carries
		 * the row's own layout classes, and inline wins over whichever stylesheet
		 * order the app happens to ship. There is deliberately no transition —
		 * the preview is positioned every frame, and with no animation there is
		 * nothing for prefers-reduced-motion to disable.
		 */
		preview.style.position = 'fixed';
		preview.style.left = '0';
		preview.style.top = '0';
		preview.style.zIndex = '9999';
		preview.style.margin = '0';
		preview.style.width = `${session.rowWidth}px`;
		preview.style.pointerEvents = 'none';
		preview.style.willChange = 'transform';
		document.body.appendChild(preview);
		session.preview = preview;
		positionPreview(session);
	}

	function positionPreview(session: DragSession) {
		if (!session.preview) return;
		const left = session.lastX - session.grabX;
		const top = session.lastY - session.grabY;
		session.preview.style.transform = `translate3d(${left}px, ${top}px, 0)`;
	}

	function updateDropTarget(session: DragSession) {
		const target = findDropTarget(session.lastX, session.lastY);
		if (target === session.target) return;
		session.target?.classList.remove(DROP_TARGET_CLASS);
		session.target = target;
		if (!target) return;
		target.classList.add(DROP_TARGET_CLASS);
		target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function schedulePreviewFrame() {
		if (previewFrame) return;
		previewFrame = requestAnimationFrame(() => {
			previewFrame = 0;
			const session = drag;
			if (!session?.active) return;
			positionPreview(session);
			updateDropTarget(session);
		});
	}

	function ensureAutoScroll() {
		if (scrollFrame) return;
		scrollFrame = requestAnimationFrame(autoScrollStep);
	}

	function autoScrollStep() {
		scrollFrame = 0;
		const session = drag;
		if (!session?.active) return;

		const height = window.innerHeight;
		let delta = 0;
		if (session.lastY < AUTOSCROLL_EDGE) {
			delta = -Math.ceil(
				((AUTOSCROLL_EDGE - session.lastY) / AUTOSCROLL_EDGE) * AUTOSCROLL_MAX_STEP
			);
		} else if (session.lastY > height - AUTOSCROLL_EDGE) {
			delta = Math.ceil(
				((session.lastY - (height - AUTOSCROLL_EDGE)) / AUTOSCROLL_EDGE) * AUTOSCROLL_MAX_STEP
			);
		}
		if (delta === 0) return;

		const before = window.scrollY;
		window.scrollBy(0, delta);
		// At the document edge the loop would spin without moving anything.
		if (window.scrollY === before) return;
		updateDropTarget(session);
		scrollFrame = requestAnimationFrame(autoScrollStep);
	}

	function onDragMove(event: PointerEvent) {
		const session = drag;
		if (!session || event.pointerId !== session.pointerId) return;
		session.lastX = event.clientX;
		session.lastY = event.clientY;

		if (!session.active) {
			const axis = classifyAxis(
				event.clientX - session.startX,
				event.clientY - session.startY,
				DRAG_THRESHOLD
			);
			if (axis === null) return;
			if (axis === 'x') {
				cleanupDrag();
				return;
			}
			activateDrag(session);
		}
		schedulePreviewFrame();
		ensureAutoScroll();
	}

	function onDragEnd(event: PointerEvent) {
		const session = drag;
		if (!session || event.pointerId !== session.pointerId) return;

		const active = session.active;
		const x = session.lastX;
		const y = session.lastY;
		const target = active ? findDropTarget(x, y) : null;
		cleanupDrag();
		if (!active) return;

		suppressNextClick();
		void finishDrop(session, target, x, y);
	}

	function onDragCancel(event: PointerEvent) {
		if (!drag || event.pointerId !== drag.pointerId) return;
		cancelDrag(true);
	}

	function onDragKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !drag) return;
		event.preventDefault();
		event.stopPropagation();
		cancelDrag(true);
	}

	function cancelDrag(returnFocus: boolean) {
		const session = drag;
		if (!session) return;
		const active = session.active;
		cleanupDrag();
		if (active) void announce(t('gestures_drag_cancelled'));
		if (returnFocus) session.handle.focus({ preventScroll: true });
	}

	function cleanupDrag(): DragSession | null {
		const session = drag;
		drag = null;

		if (typeof window !== 'undefined') {
			window.removeEventListener('pointermove', onDragMove);
			window.removeEventListener('pointerup', onDragEnd);
			window.removeEventListener('pointercancel', onDragCancel);
			window.removeEventListener('keydown', onDragKeyDown, true);
			if (previewFrame) cancelAnimationFrame(previewFrame);
			if (scrollFrame) cancelAnimationFrame(scrollFrame);
			previewFrame = 0;
			scrollFrame = 0;
		}

		if (session) {
			try {
				if (session.handle.hasPointerCapture?.(session.pointerId)) {
					session.handle.releasePointerCapture(session.pointerId);
				}
			} catch {
				// The row can already be detached by a reload.
			}
			session.row.classList.remove(SOURCE_CLASS);
			session.target?.classList.remove(DROP_TARGET_CLASS);
			session.preview?.remove();
		}

		if (typeof document !== 'undefined') document.body.classList.remove(DRAGGING_CLASS);
		return session;
	}

	function suppressNextClick() {
		if (typeof document === 'undefined') return;
		releaseClickGuard();
		const handler = (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
		};
		document.addEventListener('click', handler, true);
		const timer = window.setTimeout(() => {
			if (clickGuard?.handler === handler) releaseClickGuard();
		}, 0);
		clickGuard = { handler, timer };
	}

	function releaseClickGuard() {
		if (!clickGuard) return;
		document.removeEventListener('click', clickGuard.handler, true);
		clearTimeout(clickGuard.timer);
		clickGuard = null;
	}

	function applyOptimistic(lane: DragLane, ids: string[]) {
		if (lane === 'allDay') optimisticAllDay = { ids, base: allDaySignature };
		else optimisticUntimed = { ids, base: untimedSignature };
	}

	function restoreOptimistic(lane: DragLane, previous: OptimisticOrder | null) {
		if (lane === 'allDay') optimisticAllDay = previous;
		else optimisticUntimed = previous;
	}

	async function finishDrop(
		session: DragSession,
		target: HTMLElement | null,
		x: number,
		y: number
	) {
		if (target) {
			const dropKey = target.dataset.dropDate ?? 'ideas';
			if (dropKey === (day.date ?? 'ideas')) {
				void announce(t('gestures_drag_cancelled'));
				return;
			}
			const date = dropKey === 'ideas' ? null : dropKey;
			try {
				await itinerary.moveToDay(session.item._id, date, session.item.order ?? 0);
			} catch {
				toast.error(t('gestures_move_failed'));
				void announce(t('gestures_move_failed'));
				return;
			}
			const label = date ? formatWeekdayDate(date) : t('ideas');
			toast.success(t('gestures_moved_to', { date: label }));
			void announce(t('gestures_moved_to', { date: label }));
			onchanged();
			return;
		}

		const rows = laneRows(session.lane);
		const ids = laneIds(session.lane);
		const from = ids.indexOf(session.item._id);
		if (from < 0 || rows.length !== ids.length) {
			void announce(t('gestures_drag_cancelled'));
			return;
		}

		const bounds = rows[0].parentElement?.getBoundingClientRect();
		const first = rows[0].getBoundingClientRect();
		const last = rows[rows.length - 1].getBoundingClientRect();
		const withinX = bounds ? x >= bounds.left - 24 && x <= bounds.right + 24 : false;
		const withinY = y >= first.top - 24 && y <= last.bottom + 24;
		if (!withinX || !withinY) {
			void announce(t('gestures_drag_cancelled'));
			return;
		}

		const insertion = dropInsertionIndex(
			y,
			rows.map((row) => row.getBoundingClientRect())
		);
		const to = insertionToIndex(insertion, from);
		if (to === from) {
			void announce(t('gestures_drag_cancelled'));
			return;
		}

		const nextIds = moveLaneItem(ids, from, to);
		const previous = session.lane === 'allDay' ? optimisticAllDay : optimisticUntimed;
		applyOptimistic(session.lane, nextIds);
		try {
			await itinerary.setOrder(nextIds.map((id, order) => ({ id, order })));
		} catch {
			restoreOptimistic(session.lane, previous);
			toast.error(t('gestures_reorder_failed'));
			void announce(t('gestures_reorder_failed'));
			return;
		}
		void announce(t('gestures_reordered', { title: session.item.title ?? t('untitled') }));
		onchanged();
	}

	$effect(() => {
		if (selecting) cancelDrag(false);
	});

	// The route remounts this component per day, but a prop swap in isolation
	// must not leave a drag (or its preview) attached to the previous day.
	let dragDayKey: string | null = null;
	$effect(() => {
		const key = day.date ?? 'ideas';
		if (dragDayKey !== null && key !== dragDayKey) cancelDrag(false);
		dragDayKey = key;
	});

	onDestroy(() => {
		cleanupDrag();
		releaseClickGuard();
		announcementRun += 1;
	});
</script>

<svelte:window onkeydown={onSelectionKeydown} />

<section bind:this={sectionEl} aria-label={heading} class="space-y-4">
	<p class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>

	<!-- Day header -->
	<header class="space-y-3">
		<div class="flex items-start justify-between gap-3">
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
						<span title={dayWeather.description}>
							<Badge variant="info" class="font-semibold">
								<span aria-hidden="true">{dayWeather.icon}</span>
								<span aria-hidden="true">
									{t('weather_badge_temp', {
										max: String(dayWeather.maxTemp),
										min: String(dayWeather.minTemp)
									})}
									{#if dayWeather.precipitationProbability != null}
										· {t('weather_badge_chance', {
											p: String(Math.round(dayWeather.precipitationProbability))
										})}
									{/if}
									{#if dayWeather.precipitationSum != null && dayWeather.precipitationSum > 0}
										· {t('weather_badge_amount', {
											mm: String(dayWeather.precipitationSum)
										})}
									{/if}
								</span>
								<span class="sr-only">{weatherLabel}</span>
							</Badge>
						</span>
					{/if}
				</div>
				{#if !isIdeas}
					{#if day.day?.title}
						<p class="mt-0.5 text-sm font-medium text-primary-700">{day.day.title}</p>
					{/if}
					{#if day.day?.notes}
						<!-- Compact rows hide the day's note preview; Edit day still shows it. -->
						<div class="density-secondary mt-1.5 space-y-1.5 text-sm text-ink-muted">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes all user text before adding allowlisted tags (see $lib/markdown.ts) -->
							{@html renderMarkdown(day.day.notes)}
						</div>
					{/if}
				{:else}
					<p class="mt-0.5 text-sm text-ink-muted">{t('capture_ideas_hint')}</p>
				{/if}
			</div>
			<div class="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
				{#if selecting}
					<Button variant="secondary" size="sm" onclick={exitSelection} disabled={batchBusy}>
						{t('batch_done')}
					</Button>
				{:else}
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
					{#if items.length > 0}
						<Button variant="secondary" size="sm" data-batch-select onclick={enterSelection}>
							<ListChecks class="size-4" aria-hidden="true" />
							{t('batch_select')}
						</Button>
					{/if}
				{/if}
			</div>
		</div>

		{#if !selecting && (canMoveOutdoor || routePlan)}
			<div class="flex flex-wrap items-center gap-1">
				{#if canMoveOutdoor}
					<Button variant="ghost" size="sm" onclick={() => (driestOpen = true)}>
						<CloudRain class="size-4" aria-hidden="true" />
						{t('weather_move_outdoor')}
					</Button>
				{/if}
				{#if routePlan}
					<Button variant="ghost" size="sm" onclick={() => (routeOpen = true)}>
						<Footprints class="size-4" aria-hidden="true" />
						{t('route_optimise_action')}
					</Button>
				{/if}
			</div>
		{/if}

		{#if selecting}
			<div
				class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary-300 bg-primary-50 px-3 py-2"
			>
				<p class="text-sm font-semibold text-primary-800" aria-live="polite">
					{batchSelectedLabel}
				</p>
				<div class="flex flex-wrap items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						onclick={selectEveryItem}
						disabled={batchBusy || everythingSelected}
					>
						{t('batch_select_all')}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onclick={clearSelection}
						disabled={batchBusy || selectedCount === 0}
					>
						{t('batch_clear')}
					</Button>
				</div>
			</div>
			<BatchActionBar
				count={selectedCount}
				busy={batchBusy}
				onmove={openBatchMove}
				oncategorise={categoriseSelected}
				onduplicate={duplicateSelected}
				ondelete={openBatchDelete}
			/>
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
								class="density-row flex min-h-touch cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-surface"
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
	{#if allDayLane.length > 0}
		<div>
			<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
				{t('all_day')}
			</h3>
			<ul class="space-y-2">
				{#each allDayLane as item (item._id)}
					{#if selecting}
						<BatchSelectionRow
							{item}
							selected={selectedIds.has(item._id)}
							disabled={batchBusy}
							onchange={toggleItem}
						/>
					{:else}
						<TimelineEntryRow
							entry={{ kind: 'item', minutes: null, order: item.order ?? 0, item }}
							{links}
							{flightsById}
							{reservationsById}
							{homeCurrency}
							{travelerCount}
							draggable={true}
							dragLane="allDay"
							ondragpointerdown={(e, dragged) => beginDrag(e, dragged, 'allDay')}
							canMoveUp={canMove(item, 'up')}
							canMoveDown={canMove(item, 'down')}
							{onedit}
							onmoveup={(i) => move(i, 'up')}
							onmovedown={(i) => move(i, 'down')}
							onmovetoday={openMove}
							onaddexpense={addExpense}
							ondelete={removeItem}
						/>
					{/if}
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
			{#each timelineEntries as entry, i (entry.item?._id ?? `${entry.kind}-${i}`)}
				{@const isUntimed =
					entry.kind === 'item' && entry.item !== undefined && entry.minutes === null}
				{#if selecting && entry.kind === 'item' && entry.item}
					{@const item = entry.item}
					<BatchSelectionRow
						{item}
						selected={selectedIds.has(item._id)}
						disabled={batchBusy}
						onchange={toggleItem}
					/>
				{:else}
					<TimelineEntryRow
						{entry}
						{links}
						{flightsById}
						{reservationsById}
						{homeCurrency}
						{travelerCount}
						draggable={!selecting && isUntimed}
						dragLane={isUntimed ? 'untimed' : undefined}
						ondragpointerdown={(e, dragged) => beginDrag(e, dragged, 'untimed')}
						canMoveUp={entry.item ? canMove(entry.item, 'up') : false}
						canMoveDown={entry.item ? canMove(entry.item, 'down') : false}
						{onedit}
						onmoveup={(it) => move(it, 'up')}
						onmovedown={(it) => move(it, 'down')}
						onmovetoday={openMove}
						onaddexpense={addExpense}
						ondelete={removeItem}
					/>
				{/if}
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

<!-- Batch move dialog -->
<MoveToDayDialog bind:open={batchMoveOpen} {dates} current={day.date} onmove={moveSelectedTo} />

<!-- Batch delete confirmation -->
<Dialog bind:open={batchDeleteOpen} title={batchDeleteTitle}>
	<p class="text-sm text-ink-muted">{t('batch_delete_body')}</p>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (batchDeleteOpen = false)} disabled={batchBusy}>
			{t('cancel')}
		</Button>
		<Button variant="destructive" onclick={deleteSelected} disabled={batchBusy}>
			{t('delete')}
		</Button>
	{/snippet}
</Dialog>

<!-- Drier-day preview -->
{#if canMoveOutdoor}
	<MoveOutdoorDialog
		bind:open={driestOpen}
		items={outdoorItems}
		currentDate={day.date ?? ''}
		currentChance={currentChance ?? 0}
		target={driestPlan.target}
		busy={driestBusy}
		onmove={moveOutdoorItems}
	/>
{/if}

<!-- Walking order preview -->
{#if routePlan}
	<OptimiseRouteDialog
		bind:open={routeOpen}
		items={orderedRouteItems}
		plan={routePlan}
		busy={routeBusy}
		onapply={applyRouteOrder}
	/>
{/if}

<style>
	:global(body.gesture-dragging) {
		cursor: grabbing;
		user-select: none;
	}

	:global(body.gesture-dragging *) {
		cursor: grabbing !important;
		user-select: none;
	}

	:global(.gesture-drag-source) {
		opacity: 0.4;
	}

	:global([data-drop-date].gesture-drop-target) {
		outline: 2px solid rgb(var(--color-primary-600-rgb));
		outline-offset: 2px;
	}
</style>
