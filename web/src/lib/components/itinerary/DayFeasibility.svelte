<script lang="ts">
	import { CircleCheckBig, Clock, Pencil, TriangleAlert } from 'lucide-svelte';
	import {
		analyseDay,
		formatDuration,
		type ItineraryItem,
		type Overlap,
		type ScheduledEntry
	} from '$lib/db';
	import type { DayTimeline } from '$lib/db/repositories/itinerary';
	import { Button, ProgressBar } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import { entryTimeLabel } from '$lib/overview';

	interface Props {
		/** The merged day, so the check sees the same entries the timeline renders. */
		day: DayTimeline;
		/** Open an item in the edit sheet. */
		onedit: (item: ItineraryItem) => void;
	}

	let { day, onedit }: Props = $props();

	/*
	 * A day is not an infinite container. 08:00–22:00 is the waking window most
	 * itineraries actually use; fixing it keeps "how full" comparable from one
	 * day to the next. `analyseDay` already gives open-ended items a nominal hour.
	 */
	const AWAKE_MINUTES = 14 * 60;

	/*
	 * Flights and reservations sit on the same timeline, but neither carries a
	 * duration this day can rely on: a flight may land tomorrow, and a dinner has
	 * no stated finish. The check follows the itinerary items themselves — the
	 * entries that hold a start and an optional end.
	 */
	const items = $derived(
		day.timed.flatMap((entry) => (entry.kind === 'item' && entry.item ? [entry.item] : []))
	);

	const report = $derived(analyseDay(items));
	const byId = $derived(new Map(items.map((item) => [item._id, item])));

	const packed = $derived(report.scheduledMinutes / AWAKE_MINUTES);
	const packedPct = $derived(Math.round(packed * 100));
	const tone = $derived(packed >= 1 ? 'danger' : packed >= 0.8 ? 'warning' : 'primary');
	const calm = $derived(
		report.overlaps.length === 0 && report.tightGaps.length === 0 && packed < 0.8
	);

	function itemOf(entry: ScheduledEntry): ItineraryItem | null {
		return (entry._id && byId.get(entry._id)) || null;
	}

	function titleOf(entry: ScheduledEntry): string {
		return entry.title?.trim() || t('untitled');
	}

	/** The minutes two entries share, as `HH:mm–HH:mm`. `b` starts first: the list is sorted. */
	function windowOf(overlap: Overlap): string {
		const end = Math.min(overlap.a.end, overlap.b.end);
		return `${entryTimeLabel(overlap.b.start)}–${entryTimeLabel(end)}`;
	}
</script>

{#snippet editButton(entry: ScheduledEntry)}
	{@const item = itemOf(entry)}
	{#if item}
		<Button
			variant="secondary"
			size="sm"
			onclick={() => onedit(item)}
			title={t('feasibility_edit_item', { name: titleOf(entry) })}
		>
			<Pencil class="size-3.5" aria-hidden="true" />
			<span class="sr-only">{t('feasibility_edit_item', { name: titleOf(entry) })}</span>
			<span aria-hidden="true">{titleOf(entry)}</span>
		</Button>
	{/if}
{/snippet}

{#if report.timed.length > 0}
	<section aria-label={t('feasibility_section_label')} class="space-y-2">
		{#if report.overlaps.length > 0}
			<div role="alert" class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5">
				<p class="flex items-center gap-2 text-sm font-semibold text-danger">
					<TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
					{t('feasibility_overlap_title')}
				</p>
				<ul class="mt-1.5 space-y-2">
					{#each report.overlaps as overlap, i (`${overlap.a.entry._id ?? i}:${overlap.b.entry._id ?? i}`)}
						<li>
							<p class="text-sm text-ink">
								{t('feasibility_overlap_line', {
									a: titleOf(overlap.a.entry),
									b: titleOf(overlap.b.entry),
									duration: formatDuration(overlap.minutes),
									window: windowOf(overlap)
								})}
							</p>
							<div class="mt-1 flex flex-wrap gap-1.5">
								{@render editButton(overlap.a.entry)}
								{@render editButton(overlap.b.entry)}
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if report.tightGaps.length > 0}
			<div class="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
				<p class="flex items-center gap-2 text-sm font-semibold text-warning">
					<Clock class="size-4 shrink-0" aria-hidden="true" />
					{t('feasibility_tight_title')}
				</p>
				<ul class="mt-1.5 space-y-2">
					{#each report.tightGaps as gap, i (`${gap.before.entry._id ?? i}:${gap.after.entry._id ?? i}`)}
						<li>
							<p class="text-sm text-ink">
								{gap.minutes === 0
									? t('feasibility_no_gap', {
											before: titleOf(gap.before.entry),
											after: titleOf(gap.after.entry)
										})
									: t('feasibility_tight_gap', {
											duration: formatDuration(gap.minutes),
											before: titleOf(gap.before.entry),
											after: titleOf(gap.after.entry)
										})}
							</p>
							<div class="mt-1 flex flex-wrap gap-1.5">
								{@render editButton(gap.before.entry)}
								{@render editButton(gap.after.entry)}
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if calm}
			<p class="flex items-center gap-1.5 text-sm text-success">
				<CircleCheckBig class="size-4 shrink-0" aria-hidden="true" />
				{t('feasibility_fits_comfortably')}
			</p>
		{/if}

		<div class="rounded-lg border border-border bg-surface px-3 py-2.5">
			<div class="flex items-baseline justify-between gap-2">
				<span class="text-sm font-medium text-ink">{t('feasibility_meter_title')}</span>
				<span class="text-sm tabular-nums text-ink-muted"
					>{t('feasibility_packed', { pct: String(packedPct) })}</span
				>
			</div>
			<ProgressBar class="mt-2" value={packed} {tone} label={t('feasibility_meter_label')} />
			<p class="mt-1.5 text-xs text-ink-muted">
				{t('feasibility_planned_of_awake', {
					planned: formatDuration(report.scheduledMinutes),
					awake: formatDuration(AWAKE_MINUTES)
				})}
			</p>
		</div>
	</section>
{/if}
