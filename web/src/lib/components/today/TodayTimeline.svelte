<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { DayTimeline, TimelineEntry } from '$lib/db/repositories/itinerary';
	import { entryKey } from '$lib/db/repositories/itinerary';
	import { ChevronRight, MapPin } from 'lucide-svelte';
	import { t } from '$lib/i18n.svelte';
	import { cn } from '$lib/utils';
	import { entryGutterLabel, entryTimeRange, presentEntry, type PresentedEntry } from './entry';

	interface Props {
		day: DayTimeline;
		/** `entryKey` of the entry running now, so its row can say so. */
		currentKey: string | null;
		hrefBookings: ResolvedPathname;
	}

	let { day, currentKey, hrefBookings }: Props = $props();

	/** All-day items are not part of `timed`; give them the same entry shape. */
	const rows = $derived<TimelineEntry[]>([
		...day.allDay.map((item): TimelineEntry => ({
			kind: 'item',
			minutes: null,
			order: item.order ?? 0,
			item
		})),
		...day.timed
	]);

	function rowClass(isCurrent: boolean): string {
		return cn(
			'flex w-full items-start gap-3 rounded-lg border p-3 text-left',
			isCurrent ? 'border-primary-600/40 bg-primary-100/40' : 'border-border bg-surface'
		);
	}
</script>

{#snippet rowBody(entry: TimelineEntry, presented: PresentedEntry)}
	{@const Icon = presented.icon}
	<span
		class="w-12 shrink-0 pt-0.5 text-right text-xs font-medium tabular-nums leading-tight text-ink-muted"
	>
		{entryGutterLabel(entry)}
	</span>
	<span
		class="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary-700 [&_svg]:size-4"
		aria-hidden="true"
	>
		<Icon />
	</span>
	<span class="min-w-0 flex-1">
		<span class="block truncate text-sm font-medium text-ink">
			{presented.title}
		</span>
		<span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
			{#if entry.minutes != null}
				<span class="tabular-nums">{entryTimeRange(entry)}</span>
			{/if}
			{#if presented.location}
				<span class="inline-flex min-w-0 items-center gap-1">
					<MapPin class="size-3 shrink-0" aria-hidden="true" />
					<span class="max-w-[12rem] truncate">{presented.location}</span>
				</span>
			{/if}
		</span>
	</span>
{/snippet}

<section aria-labelledby="today-timeline-heading" class="space-y-3">
	<h2 id="today-timeline-heading" class="font-serif text-lg font-semibold text-ink">
		{t('todays_plan')}
	</h2>

	{#if rows.length === 0}
		<p class="text-sm text-ink-muted">{t('nothing_planned_yet')}</p>
	{:else}
		<ul class="space-y-2">
			{#each rows as entry (entryKey(entry))}
				{@const presented = presentEntry(entry)}
				{@const isCurrent = currentKey === entryKey(entry)}
				{#if entry.kind === 'item'}
					<li class={rowClass(isCurrent)} aria-current={isCurrent ? 'true' : undefined}>
						{#if isCurrent}
							<span class="sr-only">{t('today_now')} – </span>
						{/if}
						{@render rowBody(entry, presented)}
					</li>
				{:else}
					<li>
						<a
							href={hrefBookings}
							class={cn(
								rowClass(isCurrent),
								'transition-colors hover:bg-surface-sunken active:scale-[0.99]'
							)}
							aria-current={isCurrent ? 'true' : undefined}
						>
							{#if isCurrent}
								<span class="sr-only">{t('today_now')} – </span>
							{/if}
							{@render rowBody(entry, presented)}
							<ChevronRight class="mt-1 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
						</a>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</section>
