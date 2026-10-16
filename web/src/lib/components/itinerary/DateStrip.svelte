<script lang="ts">
	import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-svelte';
	import { DateTime } from 'luxon';
	import { cn } from '$lib/utils';
	import { t } from '$lib/i18n.svelte';

	interface Props {
		/** Trip dates (ISO) in order. */
		dates: string[];
		/** Selected date, or `null` for the Unscheduled / Ideas bucket. */
		selected: string | null;
		/** Today's ISO date – shows a "Today" shortcut when it falls in range. */
		today: string;
		/** Number of unscheduled items (drives the Ideas chip). */
		ideasCount: number;
		onselect: (date: string | null) => void;
	}

	let { dates, selected, today, ideasCount, onselect }: Props = $props();

	const todayInRange = $derived(dates.includes(today));
	const currentIndex = $derived(selected ? dates.indexOf(selected) : -1);
	const canPrev = $derived(currentIndex > 0);
	const canNext = $derived(currentIndex >= 0 && currentIndex < dates.length - 1);

	function goPrev() {
		if (canPrev) onselect(dates[currentIndex - 1]);
	}

	function goNext() {
		if (canNext) onselect(dates[currentIndex + 1]);
		else if (selected === null && dates.length > 0) onselect(dates[0]);
	}

	let stripEl = $state<HTMLDivElement>();

	function parts(iso: string) {
		const dt = DateTime.fromISO(iso);
		return {
			weekday: dt.isValid ? dt.toFormat('ccc') : '',
			day: dt.isValid ? dt.toFormat('d') : '',
			month: dt.isValid ? dt.toFormat('LLL') : ''
		};
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
	{#if dates.length > 1}
		<button
			type="button"
			onclick={goPrev}
			disabled={!canPrev}
			aria-label="Previous day"
			class="hidden size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-30 sm:grid [&_svg]:size-4"
		>
			<ChevronLeft />
		</button>
	{/if}

	{#if todayInRange}
		<button
			type="button"
			onclick={() => onselect(today)}
			class={cn(
				'min-h-touch shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-0 sm:text-sm',
				selected === today
					? 'border-primary-600 bg-primary-600 text-white'
					: 'border-border bg-surface text-primary-700 hover:bg-primary-100'
			)}
		>
			{t('today') || 'Today'}
		</button>
	{/if}

	<div
		bind:this={stripEl}
		class="flex flex-1 snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)] [scrollbar-width:thin] sm:[mask-image:none]"
		role="group"
		aria-label="Trip days"
	>
		{#each dates as date (date)}
			{@const p = parts(date)}
			{@const isSelected = selected === date}
			{@const isToday = date === today}
			<button
				type="button"
				aria-pressed={isSelected}
				data-key={date}
				onclick={() => onselect(date)}
				class={cn(
					'flex min-h-touch min-w-[3.5rem] shrink-0 snap-start flex-col items-center justify-center rounded-lg border px-2.5 py-1.5 text-center transition-colors',
					isSelected
						? 'border-primary-600 bg-primary-100 text-primary-700'
						: 'border-border bg-surface text-ink-muted hover:bg-surface-sunken hover:text-ink'
				)}
			>
				<span class="text-[0.7rem] font-medium uppercase tracking-wide">{p.weekday}</span>
				<span class="text-base font-semibold tabular-nums text-ink">{p.day}</span>
				<span class="text-[0.7rem]">{p.month}</span>
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
				onclick={() => onselect(null)}
				class={cn(
					'flex min-h-touch min-w-[3.5rem] shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-center transition-colors',
					selected === null
						? 'border-accent-terracotta bg-accent-terracotta/10 text-accent-terracotta'
						: 'border-border bg-surface text-ink-muted hover:bg-surface-sunken hover:text-ink'
				)}
			>
				<Lightbulb class="size-4" />
				<span class="text-[0.7rem] font-medium">{t('ideas') || 'Ideas'} ({ideasCount})</span>
			</button>
		{/if}
	</div>

	{#if dates.length > 1}
		<button
			type="button"
			onclick={goNext}
			disabled={!canNext}
			aria-label="Next day"
			class="hidden size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-30 sm:grid [&_svg]:size-4"
		>
			<ChevronRight />
		</button>
	{/if}
</div>
