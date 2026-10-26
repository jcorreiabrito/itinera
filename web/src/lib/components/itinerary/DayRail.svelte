<script lang="ts">
	import { DateTime } from 'luxon';
	import { CircleCheckBig, Clock, Lightbulb, TriangleAlert } from 'lucide-svelte';
	import type { DayTimeline } from '$lib/db/repositories/itinerary';
	import { t } from '$lib/i18n.svelte';
	import { cn } from '$lib/utils';
	import { dayItemCount, dayStatus, type DayStatus } from './day-status';

	/*
	 * The wide workspace's left rail.
	 *
	 * It is a roving-tabindex list like the mobile `DateStrip`: one tab stop, the
	 * arrow keys walk the days. `Unscheduled` is always the last entry, so the
	 * bucket the plan is built from never disappears from the rail when it is
	 * briefly empty.
	 */

	interface Props {
		days: DayTimeline[];
		unscheduled: DayTimeline;
		/** Selected date, or `null` for the Unscheduled / Ideas bucket. */
		selected: string | null;
		today: string;
		onselect: (date: string | null) => void;
	}

	let { days, unscheduled, selected, today, onselect }: Props = $props();

	let railEl = $state<HTMLElement>();

	const keys = $derived<(string | null)[]>([...days.map((day) => day.date as string), null]);
	const ideasCount = $derived(dayItemCount(unscheduled));

	/** The entry the tab key reaches: the selected day, else the first day. */
	const tabStopKey = $derived(
		selected !== null && days.some((day) => day.date === selected)
			? selected
			: selected === null
				? null
				: (days[0]?.date ?? null)
	);

	function keyOf(date: string | null): string {
		return date ?? 'ideas';
	}

	function parts(iso: string) {
		const dt = DateTime.fromISO(iso);
		return {
			weekday: dt.isValid ? dt.toFormat('ccc') : '',
			date: dt.isValid ? dt.toFormat('d LLL') : iso
		};
	}

	function focusEntry(date: string | null) {
		railEl?.querySelector<HTMLElement>(`[data-key="${keyOf(date)}"]`)?.focus();
	}

	function onRailKeyDown(event: KeyboardEvent) {
		if (keys.length === 0) return;
		const current = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-key]')
			?.dataset.key;
		const index = keys.findIndex((key) => keyOf(key) === current);
		if (index < 0) return;

		let next: number;
		switch (event.key) {
			case 'ArrowDown':
				next = Math.min(index + 1, keys.length - 1);
				break;
			case 'ArrowUp':
				next = Math.max(index - 1, 0);
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = keys.length - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		onselect(keys[next]);
		focusEntry(keys[next]);
	}
</script>

{#snippet statusIcon(status: Exclude<DayStatus, null>)}
	<span class="shrink-0">
		{#if status === 'overlap'}
			<TriangleAlert class="size-3.5 text-danger" aria-hidden="true" />
			<span class="sr-only">{t('feasibility_overlap_title')}</span>
		{:else if status === 'tight'}
			<Clock class="size-3.5 text-warning" aria-hidden="true" />
			<span class="sr-only">{t('feasibility_tight_title')}</span>
		{:else}
			<CircleCheckBig class="size-3.5 text-success" aria-hidden="true" />
			<span class="sr-only">{t('feasibility_fits_comfortably')}</span>
		{/if}
	</span>
{/snippet}

{#snippet countBadge(count: number)}
	<span
		class="shrink-0 text-xs tabular-nums {count === 0 ? 'text-ink-muted/60' : 'text-ink-muted'}"
		aria-hidden="true">{count}</span
	>
	<span class="sr-only">{t('workspace_item_count', { n: String(count) })}</span>
{/snippet}

<nav
	id="itinerary-day-rail"
	bind:this={railEl}
	aria-label={t('trip_days')}
	class="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-2 shadow-soft"
>
	<h2 class="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
		{t('workspace_days')}
	</h2>

	<ul class="space-y-1">
		{#each days as day (day.date)}
			{@const date = day.date as string}
			{@const status = dayStatus(day)}
			{@const count = dayItemCount(day)}
			{@const p = parts(date)}
			{@const isSelected = selected === date}
			<li>
				<button
					type="button"
					data-key={date}
					data-drop-date={date}
					aria-pressed={isSelected}
					tabindex={tabStopKey === date ? 0 : -1}
					onclick={() => onselect(date)}
					onkeydown={onRailKeyDown}
					class={cn(
						'flex min-h-touch w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
						isSelected
							? 'border-primary-600 bg-primary-100 text-primary-700'
							: 'border-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink'
					)}
				>
					<span class="min-w-0 flex-1">
						<span class="block text-[0.7rem] font-medium uppercase tracking-wide">{p.weekday}</span>
						<span class="block text-sm font-semibold tabular-nums text-ink">{p.date}</span>
					</span>
					<span class="flex shrink-0 items-center gap-1.5">
						{#if date === today}
							<span class="size-1.5 rounded-full bg-primary-600" aria-hidden="true"></span>
							<span class="sr-only">{t('today')}</span>
						{/if}
						{#if status}
							{@render statusIcon(status)}
						{/if}
						{@render countBadge(count)}
					</span>
				</button>
			</li>
		{/each}

		<li class="pt-1">
			<button
				type="button"
				data-key="ideas"
				data-drop-date="ideas"
				aria-pressed={selected === null}
				tabindex={tabStopKey === null ? 0 : -1}
				onclick={() => onselect(null)}
				onkeydown={onRailKeyDown}
				class={cn(
					'flex min-h-touch w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
					selected === null
						? 'border-accent-terracotta bg-accent-terracotta/10 text-accent-terracotta'
						: 'border-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink'
				)}
			>
				<Lightbulb class="size-4 shrink-0" aria-hidden="true" />
				<span class="min-w-0 flex-1 truncate text-sm font-medium">{t('workspace_unscheduled')}</span
				>
				{@render countBadge(ideasCount)}
			</button>
		</li>
	</ul>
</nav>
