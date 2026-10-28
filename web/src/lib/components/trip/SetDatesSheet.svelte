<script lang="ts">
	import {
		AlertTriangle,
		BedDouble,
		CalendarRange,
		ChevronLeft,
		ChevronRight,
		Plane,
		RotateCcw
	} from 'lucide-svelte';
	import {
		flights as flightsRepo,
		itinerary,
		reservations as reservationsRepo,
		todayIso,
		tripDates
	} from '$lib/db';
	import type { ItineraryItem, Trip, TripDay } from '$lib/db';
	import {
		anchorsFor,
		buildPlan,
		previewSetDates,
		suggestStartDates,
		type Anchor,
		type PreviewWarning
	} from '$lib/db/date-assignment';
	import { weekdayOf, weekdayShortName, isDreamTrip } from '$lib/db/date-mode';
	import { dayItems } from '$lib/components/itinerary/day-status';
	import {
		Badge,
		Button,
		Checkbox,
		Dialog,
		Field,
		Input,
		Select,
		Sheet,
		toast
	} from '$lib/components/ui';
	import { formatWeekdayDate } from '$lib/format';
	import { getLanguage, t } from '$lib/i18n.svelte';
	import { cn } from '$lib/utils';

	/*
	 * The guided "Set dates" flow.
	 *
	 * A dream plan is numbered days with weekday wishes; this sheet maps them
	 * onto the calendar and shows the consequences before writing anything. The
	 * same sheet re-dates an already-dated trip and can make it flexible again,
	 * so the conversion is never a one-way door.
	 *
	 * All arithmetic is `date-assignment.ts`; this component is the preview and
	 * the toggle set.
	 */

	interface Props {
		open?: boolean;
		/** The trip whose dates are being set. */
		trip: Trip;
		/** Reload the page after a successful write. */
		onsaved?: () => void;
	}

	let { open = $bindable(false), trip, onsaved }: Props = $props();

	let loading = $state(false);
	let loadFailed = $state(false);
	let busy = $state(false);
	let items = $state<ItineraryItem[]>([]);
	let dayDocs = $state<TripDay[]>([]);
	let anchors = $state<Anchor[]>([]);

	let startDate = $state('');
	let offsets = $state<Record<number, number>>({});
	let moveBookings = $state(false);
	/** Whether a nudge moves one day or that day and every later one. */
	let nudgeScope = $state<'day' | 'later'>('later');

	const dream = $derived(isDreamTrip(trip));
	const plan = $derived(buildPlan(trip, items, dayDocs));
	const preview = $derived(
		previewSetDates(plan, items, { startDate, offsets, moveBookings }, anchors)
	);

	const wishTotal = $derived(plan.days.filter((day) => day.weekdayHint != null).length);
	const suggestions = $derived(
		wishTotal > 0 && preview.valid ? suggestStartDates(plan, startDate, anchors) : []
	);

	const dayOneWeekday = $derived(weekdayShortName(weekdayOf(startDate), getLanguage()));

	/** How many plans items would leave the range on "make flexible". */
	const outsideCount = $derived.by(() => {
		if (dream) return 0;
		const dates = new Set(plan.days.flatMap((day) => (day.date ? [day.date] : [])));
		return items.filter((item) => item.date && !dates.has(item.date)).length;
	});

	function defaultStart(): string {
		if (!dream && trip.startDate) return trip.startDate;
		// A dream plan with bookings starts where its first booking is: that is
		// the one real date the plan is already tied to.
		return anchors[0]?.startDate ?? todayIso();
	}

	let loadGeneration = 0;
	$effect(() => {
		if (!open) return;
		const tid = trip._id;
		const generation = ++loadGeneration;
		loading = true;
		loadFailed = false;
		void (async () => {
			try {
				const [timeline, flights, reservations] = await Promise.all([
					itinerary.tripTimeline(tid),
					flightsRepo.byTrip(tid),
					reservationsRepo.byTrip(tid)
				]);
				if (generation !== loadGeneration) return;
				items = [...timeline.days.flatMap(dayItems), ...dayItems(timeline.unscheduled)];
				dayDocs = timeline.days.flatMap((day) => (day.day ? [day.day] : []));
				anchors = anchorsFor(flights, reservations);
				startDate = defaultStart();
				offsets = {};
				moveBookings = false;
				nudgeScope = 'later';
			} catch {
				if (generation === loadGeneration) loadFailed = true;
			} finally {
				if (generation === loadGeneration) loading = false;
			}
		})();
	});

	function offsetOf(ordinal: number): number {
		return offsets[ordinal] ?? 0;
	}

	/**
	 * Can this nudge keep the sequence valid?
	 *
	 * Offsets are non-decreasing and every date must stay strictly after the
	 * previous one. Moving "this and later" earlier therefore needs slack above
	 * the previous day, and moving a single day later needs slack below the next.
	 */
	function canNudge(ordinal: number, direction: 1 | -1): boolean {
		const current = offsetOf(ordinal);
		if (nudgeScope === 'later') {
			if (direction === 1) return true;
			return current > offsetOf(ordinal - 1);
		}
		if (direction === -1) return current > offsetOf(ordinal - 1);
		const next = plan.days.find((day) => day.ordinal === ordinal + 1);
		return !next || current < offsetOf(next.ordinal);
	}

	function nudge(ordinal: number, direction: 1 | -1) {
		if (!canNudge(ordinal, direction)) return;
		const next = { ...offsets };
		if (nudgeScope === 'later') {
			for (const day of plan.days) {
				if (day.ordinal >= ordinal) next[day.ordinal] = offsetOf(day.ordinal) + direction;
			}
		} else {
			next[ordinal] = offsetOf(ordinal) + direction;
		}
		const candidate = previewSetDates(
			plan,
			items,
			{ startDate, offsets: next, moveBookings },
			anchors
		);
		if (candidate.valid) offsets = next;
	}

	function resetNudges() {
		offsets = {};
	}

	function matchesFor(start: string): number {
		return previewSetDates(plan, [], { startDate: start }, anchors).days.filter(
			(day) => day.hintMet
		).length;
	}

	function wishLabel(hint: number | null): string {
		return weekdayShortName(hint, getLanguage());
	}

	function signedDays(days: number): string {
		if (days === 0) return '0';
		return days > 0 ? `+${days}` : `−${Math.abs(days)}`;
	}

	const bookingShiftText = $derived.by(() => {
		if (preview.bookingShiftDays == null) return t('booking_shift_none');
		return t('booking_shift_days', {
			n: String(anchors.length),
			days: signedDays(preview.bookingShiftDays)
		});
	});

	const summaryWarnings = $derived(
		preview.warnings.filter((warning) => warning.code === 'items_to_ideas')
	);

	function warningText(warning: PreviewWarning): string {
		if (warning.code === 'items_to_ideas') {
			const count = Number(warning.params?.count ?? 0);
			return count === 1
				? t('items_to_ideas_warning_one')
				: t('items_to_ideas_warning_many', { n: String(count) });
		}
		return '';
	}

	async function apply() {
		if (!preview.valid || busy) return;
		busy = true;
		try {
			await tripDates.setDates(trip._id, { startDate, offsets, moveBookings });
			toast.success(dream ? t('dates_applied') : t('dates_saved'));
			open = false;
			onsaved?.();
		} catch {
			toast.error(t('could_not_set_dates'));
		} finally {
			busy = false;
		}
	}

	let clearOpen = $state(false);

	function requestMakeFlexible() {
		if (busy) return;
		clearOpen = true;
	}

	async function makeFlexible() {
		if (busy) return;
		busy = true;
		try {
			await tripDates.clearDates(trip._id);
			clearOpen = false;
			open = false;
			toast.success(t('dates_cleared'));
			onsaved?.();
		} catch {
			toast.error(t('could_not_clear_dates'));
		} finally {
			busy = false;
		}
	}

	const rowClass = (missed: boolean) =>
		cn(
			'flex flex-col gap-1.5 rounded-lg border px-3 py-2',
			missed ? 'border-warning/40 bg-warning/5' : 'border-border bg-surface'
		);
</script>

<Sheet
	bind:open
	side="right"
	title={dream ? t('set_dates_title') : t('change_dates_title')}
	description={dream ? t('set_dates_desc') : t('change_dates_desc')}
>
	{#if loading}
		<p class="py-8 text-center text-sm text-ink-muted">{t('loading')}</p>
	{:else if loadFailed}
		<p class="py-8 text-center text-sm text-danger">{t('could_not_set_dates')}</p>
	{:else}
		<div class="flex flex-col gap-5">
			<!-- Start date -->
			<section class="flex flex-col gap-2">
				<Field label={t('start_date')} for="set-dates-start" required>
					<Input
						id="set-dates-start"
						type="date"
						value={startDate}
						invalid={!preview.valid && preview.error === 'invalid_start'}
						oninput={(event) => (startDate = event.currentTarget.value)}
					/>
				</Field>
				{#if dayOneWeekday}
					<p class="text-xs text-ink-muted">{t('day_one_weekday', { weekday: dayOneWeekday })}</p>
				{/if}

				{#if suggestions.length > 0}
					<div class="mt-1 flex flex-col gap-1.5">
						<p class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
							{t('suggested_starts')}
						</p>
						<div class="flex flex-wrap gap-1.5">
							{#each suggestions as suggestion (suggestion)}
								<button
									type="button"
									aria-pressed={startDate === suggestion}
									onclick={() => (startDate = suggestion)}
									class={cn(
										'flex min-h-touch flex-col items-start rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors sm:min-h-0',
										startDate === suggestion
											? 'border-primary-600 bg-primary-100 text-primary-700'
											: 'border-border bg-surface text-ink-muted hover:bg-surface-sunken hover:text-ink'
									)}
								>
									<span class="font-semibold">{formatWeekdayDate(suggestion)}</span>
									<span
										>{t('suggestion_wishes', {
											matched: String(matchesFor(suggestion)),
											total: String(wishTotal)
										})}</span
									>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</section>

			<!-- Day map -->
			<section class="flex flex-col gap-2">
				<div class="flex flex-wrap items-end justify-between gap-2">
					<h3 class="text-sm font-semibold text-ink">{t('day_map')}</h3>
					<div class="flex items-center gap-1.5">
						<label class="text-xs text-ink-muted" for="set-dates-scope">{t('nudge_scope')}</label>
						<Select
							id="set-dates-scope"
							class="h-8 w-44 text-xs"
							value={nudgeScope}
							onchange={(event) =>
								(nudgeScope = event.currentTarget.value === 'day' ? 'day' : 'later')}
						>
							<option value="day">{t('nudge_this_day')}</option>
							<option value="later">{t('nudge_this_and_later')}</option>
						</Select>
						{#if Object.keys(offsets).length > 0}
							<Button variant="ghost" size="sm" onclick={resetNudges} disabled={busy}>
								<RotateCcw class="size-3.5" aria-hidden="true" />
								{t('reset_nudges')}
							</Button>
						{/if}
					</div>
				</div>

				{#if preview.error === 'invalid_start'}
					<p class="text-sm text-danger">{t('invalid_date_mapping')}</p>
				{:else if preview.error === 'offsets_not_increasing'}
					<p class="text-sm text-danger">{t('invalid_date_mapping')}</p>
				{/if}

				<ol class="flex flex-col gap-1.5">
					{#each plan.days as planDay (planDay.key)}
						{@const shown = preview.days.find((day) => day.ordinal === planDay.ordinal)}
						{@const missed = !!shown && !shown.hintMet}
						<li class={rowClass(missed)}>
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0">
									<p class="truncate text-sm font-semibold text-ink">
										{t('day_n', { n: String(planDay.ordinal) })}
										{#if planDay.title}
											<span class="font-normal text-ink-muted"> · {planDay.title}</span>
										{/if}
									</p>
									<p class="text-xs text-ink-muted">
										{#if shown}
											{formatWeekdayDate(shown.date)}
										{/if}
										{#if planDay.weekdayHint != null}
											<span class="text-accent-terracotta"
												>· {t('weekday_wish_short', {
													day: wishLabel(planDay.weekdayHint)
												})}</span
											>
										{/if}
										{#if planDay.empty}
											<Badge variant="neutral" class="ml-1">{t('empty_day_tag')}</Badge>
										{/if}
									</p>
								</div>
								<div class="flex shrink-0 items-center gap-0.5">
									<button
										type="button"
										class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-30"
										disabled={!canNudge(planDay.ordinal, -1) || busy}
										onclick={() => nudge(planDay.ordinal, -1)}
									>
										<ChevronLeft class="size-4" aria-hidden="true" />
										<span class="sr-only"
											>{t('move_earlier')} — {t('day_n', { n: String(planDay.ordinal) })}</span
										>
									</button>
									<button
										type="button"
										class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-30"
										disabled={!canNudge(planDay.ordinal, 1) || busy}
										onclick={() => nudge(planDay.ordinal, 1)}
									>
										<ChevronRight class="size-4" aria-hidden="true" />
										<span class="sr-only"
											>{t('move_later')} — {t('day_n', { n: String(planDay.ordinal) })}</span
										>
									</button>
								</div>
							</div>
							{#if missed && shown}
								<p class="flex items-center gap-1 text-xs text-warning">
									<AlertTriangle class="size-3 shrink-0" aria-hidden="true" />
									{t('wish_missed_day', {
										wish: wishLabel(planDay.weekdayHint),
										date: formatWeekdayDate(shown.date)
									})}
								</p>
							{/if}
						</li>
					{/each}
				</ol>
			</section>

			<!-- Anchors -->
			{#if anchors.length > 0}
				<section class="flex flex-col gap-2">
					<h3 class="text-sm font-semibold text-ink">{t('anchored_bookings')}</h3>
					<ul class="flex flex-col gap-1">
						{#each preview.anchors as anchor (anchor.id)}
							<li
								class="flex flex-wrap items-center justify-between gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs"
							>
								<span class="flex min-w-0 items-center gap-1.5">
									{#if anchor.kind === 'flight'}
										<Plane class="size-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
									{:else}
										<BedDouble class="size-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
									{/if}
									<span class="truncate font-medium text-ink">{anchor.label}</span>
								</span>
								<span class="flex items-center gap-2">
									<span class="text-ink-muted">
										{#if anchor.startDate === anchor.endDate}
											{formatWeekdayDate(anchor.startDate)}
										{:else}
											{formatWeekdayDate(anchor.startDate)} – {formatWeekdayDate(anchor.endDate)}
										{/if}
									</span>
									<Badge variant={anchor.inRange ? 'success' : 'warning'}>
										{anchor.inRange ? t('in_range') : t('out_of_range')}
									</Badge>
								</span>
							</li>
						{/each}
					</ul>
					<Checkbox bind:checked={moveBookings} label={t('move_bookings')} />
					<p class="text-xs text-ink-muted">{t('move_bookings_hint')}</p>
					<p class="text-xs font-medium text-ink-muted">{bookingShiftText}</p>
				</section>
			{/if}

			<!-- Summary -->
			{#if summaryWarnings.length > 0 || !preview.valid}
				<section class="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2">
					{#each summaryWarnings as warning, index (index)}
						<p class="text-xs text-warning">{warningText(warning)}</p>
					{/each}
					{#if !preview.valid}
						<p class="text-xs text-danger">{t('invalid_date_mapping')}</p>
					{/if}
				</section>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		<div class="flex w-full flex-wrap items-center justify-between gap-2">
			{#if !dream}
				<Button
					variant="ghost"
					class="text-danger"
					onclick={requestMakeFlexible}
					disabled={busy || loading}
				>
					<CalendarRange class="size-4" aria-hidden="true" />
					{t('make_flexible')}
				</Button>
			{:else}
				<span></span>
			{/if}
			<div class="flex gap-2">
				<Button variant="ghost" onclick={() => (open = false)} disabled={busy}>{t('cancel')}</Button
				>
				<Button onclick={apply} disabled={busy || loading || !preview.valid}>
					{busy ? t('saving') : dream ? t('apply_dates') : t('save_dates')}
				</Button>
			</div>
		</div>
	{/snippet}
</Sheet>

<Dialog bind:open={clearOpen} title={t('make_flexible_title')}>
	<div class="flex flex-col gap-2">
		<p class="text-sm text-ink-muted">{t('make_flexible_body')}</p>
		{#if outsideCount > 0}
			<p class="text-sm text-warning">
				{outsideCount === 1
					? t('items_to_ideas_warning_one')
					: t('items_to_ideas_warning_many', { n: String(outsideCount) })}
			</p>
		{/if}
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (clearOpen = false)} disabled={busy}>
			{t('cancel')}
		</Button>
		<Button variant="destructive" onclick={makeFlexible} disabled={busy}>
			{busy ? t('saving') : t('make_flexible_confirm')}
		</Button>
	{/snippet}
</Dialog>
