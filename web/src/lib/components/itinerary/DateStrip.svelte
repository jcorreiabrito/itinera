<script lang="ts">
	import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { t } from '$lib/i18n.svelte';
	import { datedParts, dayWish, type DayOption } from './day-options';

	interface Props {
		/** Trip days in order: dates or numbered dream days. */
		days: DayOption[];
		/** Selected day key, or `null` for the Unscheduled / Ideas bucket. */
		selected: string | null;
		/** Today's ISO date – shows a "Today" shortcut when it falls in range. */
		today: string;
		/** Number of unscheduled items (drives the Ideas chip). */
		ideasCount: number;
		onselect: (key: string | null) => void;
	}

	let { days, selected, today, ideasCount, onselect }: Props = $props();

	const keys = $derived(days.map((day) => day.key));
	const hasToday = $derived(days.some((day) => day.date === today));
	const currentIndex = $derived(selected ? keys.indexOf(selected) : -1);
	const canPrev = $derived(currentIndex > 0);
	const canNext = $derived(currentIndex >= 0 && currentIndex < keys.length - 1);

	function goPrev() {
		if (canPrev) onselect(keys[currentIndex - 1]);
	}

	function goNext() {
		if (canNext) onselect(keys[currentIndex + 1]);
		else if (selected === null && keys.length > 0) onselect(keys[0]);
	}

	let stripEl = $state<HTMLDivElement>();

	/*
	 * One tab stop, not one per day.
	 *
	 * The strip is a single control that happens to be drawn as twenty buttons:
	 * tabbing through it used to cost a keystroke per day of the trip before the
	 * user reached the itinerary itself. Instead exactly one chip is tabbable —
	 * the selected one, so tabbing back in lands where they left — and the arrow
	 * keys walk the rest. That is the roving-tabindex pattern, which is why the
	 * container is a `toolbar` and not a `group`: a `group` has no keyboard
	 * contract of its own, so the handler below would have been a listener on a
	 * non-interactive element — both a lint warning and a lie to a screen reader.
	 */
	/**
	 * Every chip in the strip, in tab order: the days, then Ideas when it has
	 * anything in it. `null` is the Ideas chip, which is a selection like any
	 * other but has no day key.
	 */
	function stripKeys(dayKeys: string[], ideas: number): (string | null)[] {
		return ideas > 0 ? [...dayKeys, null] : dayKeys;
	}

	const chips = $derived(stripKeys(keys, ideasCount));
	/** The chip the tab key reaches: the selected day, else the Ideas chip, else the first. */
	const tabStopKey = $derived(
		selected !== null && keys.includes(selected)
			? selected
			: selected === null && ideasCount > 0
				? null
				: (keys[0] ?? null)
	);

	function keyOf(key: string | null): string {
		return key ?? 'ideas';
	}

	function focusChip(key: string | null) {
		stripEl?.querySelector<HTMLElement>(`[data-key="${keyOf(key)}"]`)?.focus();
	}

	function onStripKeyDown(event: KeyboardEvent) {
		if (chips.length === 0) return;
		const current = (event.target as HTMLElement | null)?.dataset.key;
		const index = chips.findIndex((key) => keyOf(key) === current);
		if (index < 0) return;

		let next: number;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = Math.min(index + 1, chips.length - 1);
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next = Math.max(index - 1, 0);
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = chips.length - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		/*
		 * Select as we move, not just focus. The chips are `aria-pressed` toggles
		 * over one selection, so a roving focus that left the day unchanged would
		 * announce one day while the screen showed another. The selection effect
		 * below then scrolls the chip into view.
		 */
		onselect(chips[next]);
		focusChip(chips[next]);
	}

	function chipLabel(day: DayOption): string {
		const wish = dayWish(day);
		if (day.date == null && day.ordinal != null) {
			const label = t('day_n', { n: String(day.ordinal) });
			return wish ? `${label}, ${t('weekday_wish_short', { day: wish })}` : label;
		}
		const p = datedParts(day);
		return [p.weekday, p.day, p.month].filter(Boolean).join(' ');
	}

	// Keep the selected day scrolled into view when it changes.
	$effect(() => {
		const key = selected ?? 'ideas';
		const el = stripEl?.querySelector(`[data-key="${key}"]`);
		const reduce =
			typeof window !== 'undefined' &&
			window.matchMedia(`(prefers-reduced-motion: reduce)`).matches;
		el?.scrollIntoView({
			inline: 'center',
			block: 'nearest',
			behavior: reduce ? 'auto' : 'smooth'
		});
	});
</script>

<div class="flex items-center gap-1.5 sm:gap-2">
	{#if days.length > 1}
		<button
			type="button"
			onclick={goPrev}
			disabled={!canPrev}
			aria-label={t('previous_day')}
			aria-keyshortcuts="["
			class="hidden size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-30 sm:grid [&_svg]:size-4"
		>
			<ChevronLeft />
		</button>
	{/if}

	{#if hasToday}
		<button
			type="button"
			onclick={() => onselect(today)}
			data-drop-key={today}
			class={cn(
				'min-h-touch shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-0 sm:text-sm',
				selected === today
					? 'border-primary-600 bg-primary-600 text-white'
					: 'border-border bg-surface text-primary-700 hover:bg-primary-100'
			)}
		>
			{t('today')}
		</button>
	{/if}

	<div
		bind:this={stripEl}
		class="flex flex-1 snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)] [scrollbar-width:thin] sm:[mask-image:none]"
		role="toolbar"
		aria-orientation="horizontal"
		aria-label={t('trip_days')}
		tabindex="-1"
		onkeydown={onStripKeyDown}
	>
		{#each days as day (day.key)}
			{@const p = datedParts(day)}
			{@const wish = dayWish(day)}
			{@const isSelected = selected === day.key}
			{@const isToday = day.date === today}
			<button
				type="button"
				aria-pressed={isSelected}
				aria-label={chipLabel(day)}
				data-key={day.key}
				data-drop-key={day.key}
				tabindex={tabStopKey === day.key ? 0 : -1}
				onclick={() => onselect(day.key)}
				class={cn(
					'flex min-h-touch min-w-[3.5rem] shrink-0 snap-start flex-col items-center justify-center rounded-lg border px-2.5 py-1.5 text-center transition-colors',
					isSelected
						? 'border-primary-600 bg-primary-100 text-primary-700'
						: 'border-border bg-surface text-ink-muted hover:bg-surface-sunken hover:text-ink'
				)}
			>
				{#if day.date == null && day.ordinal != null}
					<span class="text-[0.7rem] font-medium uppercase tracking-wide">{t('label_day')}</span>
					<span class="text-base font-semibold tabular-nums text-ink">{day.ordinal}</span>
					<span class="text-[0.7rem]">{wish || ' '}</span>
				{:else}
					<span class="text-[0.7rem] font-medium uppercase tracking-wide">{p.weekday}</span>
					<span class="text-base font-semibold tabular-nums text-ink">{p.day}</span>
					<span class="text-[0.7rem]">{p.month}</span>
				{/if}
				{#if isToday}
					<span class="mt-0.5 h-1 w-1 rounded-full bg-primary-600" aria-hidden="true"></span>
				{/if}
			</button>
		{/each}

		{#if ideasCount > 0}
			<button
				type="button"
				aria-pressed={selected === null}
				data-key="ideas"
				data-drop-key="ideas"
				tabindex={tabStopKey === null ? 0 : -1}
				onclick={() => onselect(null)}
				class={cn(
					'flex min-h-touch min-w-[3.5rem] shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-center transition-colors',
					selected === null
						? 'border-accent-terracotta bg-accent-terracotta/10 text-accent-terracotta'
						: 'border-border bg-surface text-ink-muted hover:bg-surface-sunken hover:text-ink'
				)}
			>
				<Lightbulb class="size-4" />
				<span class="text-[0.7rem] font-medium">{t('ideas')} ({ideasCount})</span>
			</button>
		{/if}
	</div>

	{#if days.length > 1}
		<button
			type="button"
			onclick={goNext}
			disabled={!canNext}
			aria-label={t('next_day')}
			aria-keyshortcuts="]"
			class="hidden size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-30 sm:grid [&_svg]:size-4"
		>
			<ChevronRight />
		</button>
	{/if}
</div>
