<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { DateTime } from 'luxon';
	import {
		BedDouble,
		CalendarDays,
		CalendarOff,
		ChevronRight,
		ListChecks,
		Pencil,
		Wallet
	} from 'lucide-svelte';
	import { bareTripUid } from '$lib/db';
	import type { Trip } from '$lib/db';
	import { Card } from '$lib/components/ui';
	import { getLanguage, t, type TranslationKey } from '$lib/i18n.svelte';
	import { formatDateRange } from '$lib/format';
	import { computeHorizon, type HorizonCounts, type HorizonFlag } from '$lib/horizon';
	import type { IconComponent } from '$lib/types';
	import { cn } from '$lib/utils';

	interface Props {
		/** Non-archived trips; archived trips have no horizon. */
		trips: readonly Trip[];
		/** Per-trip child counts from `countPlanning`. */
		counts: HorizonCounts;
		/** Today's ISO date, owned by the page so the model never reads a clock. */
		today: string;
		/** Opens the existing trip editor, where an undated trip gets its dates. */
		onedit: (trip: Trip) => void;
		class?: string;
	}

	let { trips, counts, today, onedit, class: className }: Props = $props();

	const model = $derived(computeHorizon(trips, counts, today));
	const tripById = $derived(new Map(trips.map((trip) => [trip._id, trip] as const)));

	const FLAG_META: Record<HorizonFlag, { icon: IconComponent; labelKey: TranslationKey }> = {
		no_dates: { icon: CalendarOff, labelKey: 'horizon_flag_undated' },
		no_itinerary: { icon: CalendarDays, labelKey: 'horizon_flag_no_itinerary' },
		no_checklist: { icon: ListChecks, labelKey: 'horizon_flag_no_checklist' },
		no_budget: { icon: Wallet, labelKey: 'horizon_flag_no_budget' },
		no_lodging: { icon: BedDouble, labelKey: 'horizon_flag_no_lodging' }
	};

	const TONE_CLASS: Record<'past' | 'active' | 'upcoming', string> = {
		past: 'bg-ink-muted/40',
		active: 'bg-success',
		upcoming: 'bg-primary-500'
	};

	/** Percentage across the window of today's date, for the vertical marker. */
	const todayLeft = $derived.by(() => {
		const month = model.months.find((entry) => today >= entry.start && today <= entry.end);
		if (!month) return null;
		const day = Number(today.slice(8, 10));
		if (!Number.isFinite(day) || day < 1) return null;
		return month.left + ((day - 1) / month.days) * month.width;
	});

	function tripHref(tripId: string): ResolvedPathname {
		return resolve('/trip/[id]/overview', { id: bareTripUid(tripId) });
	}

	function titleOf(title: string): string {
		return title || t('untitled_trip');
	}

	function monthLabel(index: number, start: string): string {
		const date = DateTime.fromISO(start, { locale: getLanguage() });
		if (!date.isValid) return start;
		const short = date.toFormat('LLL');
		// The year only changes once inside a six-month window, so repeating it
		// on every column would be noise. Show it on the first column and at the
		// January boundary.
		return index === 0 || date.month === 1 ? `${short} ${date.year}` : short;
	}

	function whenLabel(tone: 'active' | 'upcoming', daysUntil: number): string {
		if (daysUntil === 0) return t('today');
		if (tone === 'active') return t('horizon_in_progress');
		if (daysUntil === 1) return t('horizon_in_days_one');
		return t('horizon_in_days', { n: String(daysUntil) });
	}

	function flagsOf(tripId: string): HorizonFlag[] {
		return model.flags[tripId] ?? [];
	}
</script>

{#if trips.length > 0}
	<Card class={cn('p-4 sm:p-5', className)}>
		<div>
			<h2 class="font-serif text-base font-semibold text-ink">
				{t('horizon_title')}
			</h2>
			<p class="text-xs text-ink-muted">{t('horizon_subtitle')}</p>
		</div>

		<!--
			The rail scrolls as one surface, so a band and the month above it can
			never drift apart. Six months do not fit a phone; from `lg` the
			minimum width is released and the whole window is visible at once.
		-->
		<!--
			A scroll container has to take a tab stop, otherwise a keyboard user
			cannot pan it at all; the rule assumes a non-interactive role never
			needs one.
		-->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="mt-3 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth rounded-md pb-1 [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg lg:overflow-visible"
			role="group"
			aria-label={t('horizon_timeline_aria')}
			tabindex="0"
		>
			<div class="min-w-[40rem] lg:min-w-0">
				<div class="flex border-b border-border pb-1" aria-hidden="true">
					{#each model.months as month, index (month.start)}
						<div
							class="shrink-0 snap-start truncate border-l border-border/60 pl-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted first:border-l-0"
							style="width: {month.width}%"
						>
							{monthLabel(index, month.start)}
						</div>
					{/each}
				</div>

				<div class="relative mt-1">
					{#if todayLeft != null}
						<div
							class="pointer-events-none absolute inset-y-0 z-10 w-px bg-primary-600/70"
							style="left: {todayLeft}%"
							role="img"
							aria-label={t('today')}
						>
							<span
								class="absolute -top-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-primary-600"
							></span>
						</div>
					{/if}

					{#if model.bars.length === 0}
						<p class="py-3 text-xs text-ink-muted">{t('horizon_no_dated_trips')}</p>
					{:else}
						<ul>
							{#each model.bars as bar (bar.tripId)}
								<li>
									<a
										href={tripHref(bar.tripId)}
										class="block min-h-touch py-1.5 transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600"
									>
										<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
											<span class="max-w-[14rem] truncate font-medium text-ink">
												{titleOf(bar.title)}
											</span>
											<span class="text-ink-muted">
												{formatDateRange(bar.startDate, bar.endDate)}
											</span>
											{@render flagIcons(flagsOf(bar.tripId))}
										</div>
										<span
											class="relative mt-1 block h-2 rounded-full bg-surface-sunken"
											aria-hidden="true"
										>
											<span
												class="absolute inset-y-0 min-w-[0.5rem] rounded-full {TONE_CLASS[
													bar.tone
												]}"
												style="left: {bar.left}%; width: {bar.width}%"
											></span>
										</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</div>

		{#if model.upcoming.length > 0}
			<div class="mt-4 border-t border-border pt-3">
				<h3 class="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
					{t('horizon_upcoming_title')}
				</h3>
				<ul class="mt-1 divide-y divide-border">
					{#each model.upcoming as entry (entry.tripId)}
						<li>
							<a
								href={tripHref(entry.tripId)}
								class="flex min-h-touch items-center gap-3 rounded-md px-1 py-2 transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
							>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm font-medium text-ink">
										{titleOf(entry.title)}
									</span>
									<span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
										<span
											class={cn(
												'font-medium',
												entry.tone === 'active' || entry.daysUntil === 0
													? 'text-primary-700'
													: 'text-ink-muted'
											)}
										>
											{whenLabel(entry.tone, entry.daysUntil)}
										</span>
										<span class="text-ink-muted" aria-hidden="true">·</span>
										<span class="text-ink-muted">
											{formatDateRange(entry.startDate, entry.endDate)}
										</span>
									</span>
								</span>
								{@render flagIcons(flagsOf(entry.tripId))}
								<ChevronRight class="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if model.undated.length > 0}
			<div class="mt-4 border-t border-border pt-3">
				<h3 class="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
					{t('horizon_undated_title')}
				</h3>
				<ul class="mt-1 divide-y divide-border">
					{#each model.undated as entry (entry.tripId)}
						{@const trip = tripById.get(entry.tripId)}
						{#if trip}
							<li>
								<button
									type="button"
									class="flex min-h-touch w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
									onclick={() => onedit(trip)}
								>
									<CalendarOff class="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
									<span class="min-w-0 flex-1 truncate text-sm text-ink">
										{titleOf(entry.title)}
									</span>
									<span class="shrink-0 text-xs text-ink-muted">{t('horizon_flag_undated')}</span>
									<span class="sr-only">{t('horizon_edit_dates')}</span>
									<Pencil class="size-4 shrink-0 text-primary-700" aria-hidden="true" />
								</button>
							</li>
						{/if}
					{/each}
				</ul>
			</div>
		{/if}
	</Card>
{/if}

{#snippet flagIcons(flags: HorizonFlag[])}
	{#if flags.length > 0}
		<ul class="flex flex-wrap items-center gap-1">
			{#each flags as flag (flag)}
				{@const meta = FLAG_META[flag]}
				{@const Icon = meta.icon}
				<li
					class="inline-flex items-center rounded-full border border-border bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-muted"
				>
					<span
						class="inline-flex items-center gap-1 [&_svg]:size-3"
						role="img"
						aria-label={t(meta.labelKey)}
						title={t(meta.labelKey)}
					>
						<Icon />
						<span class="hidden lg:inline">{t(meta.labelKey)}</span>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}
