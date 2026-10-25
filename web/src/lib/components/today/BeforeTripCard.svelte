<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { DayTimeline, TimelineEntry } from '$lib/db/repositories/itinerary';
	import { entryKey } from '$lib/db/repositories/itinerary';
	import { formatWeekdayDate } from '$lib/format';
	import { Button, Card } from '$lib/components/ui';
	import { Sun } from 'lucide-svelte';
	import { t } from '$lib/i18n.svelte';
	import { entryGutterLabel, presentEntry } from './entry';

	interface Props {
		/** Composed by the page with `countdownText`, e.g. "in 3 days". */
		countdown: string;
		firstDay: DayTimeline | null;
		hrefItinerary: ResolvedPathname;
	}

	let { countdown, firstDay, hrefItinerary }: Props = $props();

	const PREVIEW_LIMIT = 3;

	const preview = $derived<TimelineEntry[]>(
		firstDay
			? [
					...firstDay.allDay.map((item): TimelineEntry => ({
						kind: 'item',
						minutes: null,
						order: item.order ?? 0,
						item
					})),
					...firstDay.timed
				].slice(0, PREVIEW_LIMIT)
			: []
	);
</script>

<Card class="border-primary-600/25">
	<div class="p-5">
		<div class="flex items-center gap-3">
			<span
				class="grid size-12 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700 [&_svg]:size-6"
				aria-hidden="true"
			>
				<Sun />
			</span>
			<div class="min-w-0">
				<p class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
					{t('today_before')}
				</p>
				<p class="font-serif text-3xl font-semibold leading-tight text-primary-700">
					{countdown}
				</p>
			</div>
		</div>

		{#if firstDay && firstDay.date}
			<div class="mt-5 border-t border-border pt-4">
				<h2 class="text-sm font-semibold text-ink">
					{t('today_first_day')} · {formatWeekdayDate(firstDay.date)}
				</h2>

				{#if preview.length > 0}
					<ul class="mt-2 space-y-1.5">
						{#each preview as entry (entryKey(entry))}
							{@const presented = presentEntry(entry)}
							<li class="flex items-baseline gap-3 text-sm">
								<span class="w-12 shrink-0 text-right text-xs tabular-nums text-ink-muted">
									{entryGutterLabel(entry)}
								</span>
								<span class="min-w-0 flex-1 truncate text-ink">{presented.title}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-2 text-sm text-ink-muted">{t('nothing_planned_yet')}</p>
				{/if}
			</div>
		{/if}

		<Button class="mt-4" variant="secondary" size="sm" href={hrefItinerary}>
			{t('view_all')}
		</Button>
	</div>
</Card>
