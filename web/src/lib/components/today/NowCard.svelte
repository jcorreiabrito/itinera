<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { DayTimeline } from '$lib/db/repositories/itinerary';
	import { formatDuration, minutesOfDay } from '$lib/db/datetime';
	import type { NowState } from '$lib/today';
	import { entrySpan } from '$lib/today';
	import { formatTime } from '$lib/format';
	import { Badge, Button, Card, ProgressBar } from '$lib/components/ui';
	import { CalendarClock, CheckCheck, Clock, MapPin } from 'lucide-svelte';
	import { t } from '$lib/i18n.svelte';
	import { entryTimeRange, presentEntry } from './entry';

	interface Props {
		state: NowState;
		/** Today's merged day, used to tell "finished" apart from "nothing planned". */
		day: DayTimeline | null;
		/** Local wall-clock ISO from the page's single clock. */
		nowIso: string;
		/** "Day 2 of 7", computed by the page from the trip's dates. */
		dayLabel: string;
		hrefItinerary: ResolvedPathname;
	}

	let { state, day, nowIso, dayLabel, hrefItinerary }: Props = $props();

	const nowMinutes = $derived(minutesOfDay(nowIso) ?? 0);
	const current = $derived(state.current ? presentEntry(state.current) : null);
	const next = $derived(state.next ? presentEntry(state.next) : null);
	const currentRange = $derived(state.current ? entryTimeRange(state.current) : '');
	const nextRange = $derived(state.next ? entryTimeRange(state.next) : '');
	const hasTimed = $derived((day?.timed ?? []).some((entry) => entry.minutes != null));
	const hasAny = $derived((day?.timed.length ?? 0) > 0 || (day?.allDay.length ?? 0) > 0);

	/** Minutes left in the current item; `null` when it is a moment, not a span. */
	const remaining = $derived.by(() => {
		if (!state.current) return null;
		const span = entrySpan(state.current);
		if (span?.end == null) return null;
		return Math.max(0, span.end - nowMinutes);
	});
</script>

<!--
	Sticks below the shell header (4rem + its safe-area padding), so the answer
	to "what now, what next" survives a scroll through the day's timeline. z-20
	keeps it above the page and under the header (z-30) and bottom tab bar (z-50).
-->
<section
	aria-label={t('today_now')}
	class="sticky top-[calc(4rem_+_env(safe-area-inset-top,0px))] z-20"
>
	<Card class="border-primary-600/30 shadow-card">
		<div class="p-4 sm:p-5">
			<div class="flex items-center justify-between gap-3">
				<p class="text-xs font-semibold uppercase tracking-wide text-primary-700">
					{t('today_now')}
				</p>
				<div class="flex items-center gap-2">
					{#if dayLabel}
						<Badge variant="neutral">{dayLabel}</Badge>
					{/if}
					<span class="inline-flex items-center gap-1 text-sm tabular-nums text-ink-muted">
						<Clock class="size-3.5" aria-hidden="true" />
						{formatTime(nowIso)}
					</span>
				</div>
			</div>

			{#if current && state.current}
				{@const Icon = current.icon}
				<div class="mt-3 flex items-start gap-3">
					<span
						class="grid size-11 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700 [&_svg]:size-5"
						aria-hidden="true"
					>
						<Icon />
					</span>
					<div class="min-w-0 flex-1">
						<h2 class="text-balance text-xl font-semibold leading-tight text-ink">
							{current.title}
						</h2>
						<p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-muted">
							{#if currentRange}
								<span class="tabular-nums">{currentRange}</span>
							{/if}
							{#if current.location}
								<span class="inline-flex items-center gap-1">
									<MapPin class="size-3.5" aria-hidden="true" />
									<span class="max-w-[16rem] truncate">{current.location}</span>
								</span>
							{/if}
						</p>
					</div>
				</div>

				{#if state.progress != null}
					<div class="mt-4 space-y-1.5">
						<ProgressBar
							value={state.progress}
							label={t('today_progress_label', { title: current.title })}
						/>
						{#if remaining != null}
							<p class="text-right text-xs font-medium tabular-nums text-ink-muted">
								{t('today_minutes_left', { duration: formatDuration(remaining) })}
							</p>
						{/if}
					</div>
				{/if}

				{#if next && state.minutesUntilNext != null}
					<div class="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
						<div class="min-w-0">
							<p class="text-[0.7rem] font-semibold uppercase tracking-wide text-ink-muted">
								{t('next_up')}
							</p>
							<p class="truncate text-sm font-medium text-ink">
								{next.title}
								{#if nextRange}<span class="font-normal text-ink-muted"> · {nextRange}</span>{/if}
							</p>
						</div>
						<Badge variant="primary" class="shrink-0 tabular-nums">
							{t('today_in_duration', { duration: formatDuration(state.minutesUntilNext) })}
						</Badge>
					</div>
				{:else}
					<p class="mt-4 border-t border-border pt-3 text-sm text-ink-muted">
						{t('today_done_for_today')}
					</p>
				{/if}
			{:else if next && state.minutesUntilNext != null}
				{@const Icon = next.icon}
				<div class="mt-3 flex items-start gap-3">
					<span
						class="grid size-11 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700 [&_svg]:size-5"
						aria-hidden="true"
					>
						<Icon />
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-[0.7rem] font-semibold uppercase tracking-wide text-ink-muted">
							{t('next_up')}
						</p>
						<p
							class="font-serif text-3xl font-semibold tabular-nums leading-tight text-primary-700"
						>
							{t('today_in_duration', { duration: formatDuration(state.minutesUntilNext) })}
						</p>
						<h2 class="mt-1 text-balance text-lg font-semibold leading-tight text-ink">
							{next.title}
						</h2>
						<p class="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
							{#if nextRange}<span class="tabular-nums">{nextRange}</span>{/if}
							{#if next.location}
								<span class="inline-flex items-center gap-1">
									<MapPin class="size-3.5" aria-hidden="true" />
									<span class="max-w-[16rem] truncate">{next.location}</span>
								</span>
							{/if}
						</p>
					</div>
				</div>
			{:else if hasTimed}
				<div class="mt-3 flex items-start gap-3">
					<span
						class="grid size-11 shrink-0 place-items-center rounded-full bg-success/10 text-success [&_svg]:size-5"
						aria-hidden="true"
					>
						<CheckCheck />
					</span>
					<div class="min-w-0">
						<h2 class="text-xl font-semibold leading-tight text-ink">
							{t('today_done_for_today')}
						</h2>
						<p class="mt-1 text-sm text-ink-muted">{t('today_done_desc')}</p>
					</div>
				</div>
			{:else if hasAny}
				<div class="mt-3 flex items-start gap-3">
					<span
						class="grid size-11 shrink-0 place-items-center rounded-full bg-surface-sunken text-ink-muted [&_svg]:size-5"
						aria-hidden="true"
					>
						<CalendarClock />
					</span>
					<div class="min-w-0">
						<h2 class="text-lg font-semibold leading-tight text-ink">
							{t('today_nothing_timed')}
						</h2>
					</div>
				</div>
			{:else}
				<div class="mt-3 flex items-start gap-3">
					<span
						class="grid size-11 shrink-0 place-items-center rounded-full bg-surface-sunken text-ink-muted [&_svg]:size-5"
						aria-hidden="true"
					>
						<CalendarClock />
					</span>
					<div class="min-w-0">
						<h2 class="text-lg font-semibold leading-tight text-ink">
							{t('no_activities_today')}
						</h2>
						<Button class="mt-3" variant="secondary" size="sm" href={hrefItinerary}>
							{t('today_open_itinerary')}
						</Button>
					</div>
				</div>
			{/if}
		</div>
	</Card>
</section>
