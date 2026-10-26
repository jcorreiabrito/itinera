<script lang="ts">
	import type { ItineraryItem } from '$lib/db';
	import { MapPin } from 'lucide-svelte';
	import { formatTime } from '$lib/format';
	import { t } from '$lib/i18n.svelte';
	import { cn } from '$lib/utils';
	import { categoryMeta } from './categories';

	/*
	 * A timeline row that trades the row menu for a checkbox.
	 *
	 * It mirrors `TimelineEntryRow`'s structure — time gutter, category bubble,
	 * card — so the timed lane's connector still lines up. The checkbox lives
	 * inside the card's label, which makes the whole row a >=44px target and
	 * gives the input an accessible name built from the activity's own text;
	 * Space then toggles it with no key handler of our own.
	 */

	interface Props {
		item: ItineraryItem;
		selected: boolean;
		disabled?: boolean;
		onchange: (id: string, selected: boolean) => void;
	}

	let { item, selected, disabled = false, onchange }: Props = $props();

	const meta = $derived(categoryMeta(item.category));
	const Icon = $derived(meta.icon);
	const timeLabel = $derived(item.allDay ? t('all_day') : formatTime(item.startTime));
</script>

<li class="relative flex items-start gap-2 sm:gap-3">
	<span
		class="w-10 shrink-0 pt-2 text-right text-[0.7rem] font-medium tabular-nums leading-tight text-ink-muted sm:w-12"
		aria-hidden={!!timeLabel}
	>
		{timeLabel}
	</span>
	<span
		class={cn(
			'relative z-10 mt-1 grid size-8 shrink-0 place-items-center rounded-full border [&_svg]:size-4',
			selected
				? 'border-primary-600 bg-primary-100 text-primary-700'
				: 'border-border bg-surface text-primary-700'
		)}
		aria-hidden="true"
	>
		<Icon />
	</span>
	<label
		class={cn(
			'density-row flex min-h-touch min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-lg border p-3 shadow-soft transition-colors',
			selected
				? 'border-primary-600 bg-primary-100/60'
				: 'border-border bg-surface hover:border-primary-600/40'
		)}
	>
		<input
			type="checkbox"
			data-batch-checkbox
			checked={selected}
			{disabled}
			onchange={(e) => onchange(item._id, e.currentTarget.checked)}
			class="mt-0.5 size-5 shrink-0 rounded border-border text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
		/>
		<span class="min-w-0 flex-1">
			<span class="block font-medium text-ink">
				{#if timeLabel}<span class="sr-only">{timeLabel} – </span>{/if}{item.title ?? t('untitled')}
			</span>
			<span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
				<span class="inline-flex items-center gap-1">
					<Icon class="size-3.5" aria-hidden="true" />
					{meta.label}
				</span>
				{#if !item.allDay && item.endTime}
					<span aria-hidden="true">·</span>
					<span class="tabular-nums">{t('until_time', { time: formatTime(item.endTime) })}</span>
				{/if}
				{#if item.location?.name}
					<span aria-hidden="true">·</span>
					<span class="inline-flex min-w-0 items-center gap-1">
						<MapPin class="size-3 shrink-0" aria-hidden="true" />
						<span class="max-w-[10rem] truncate">{item.location.name}</span>
					</span>
				{/if}
			</span>
		</span>
	</label>
</li>
