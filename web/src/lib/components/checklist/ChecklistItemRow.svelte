<script lang="ts">
	import type { ChecklistItem } from '$lib/db';
	import { dayDelta, todayIso } from '$lib/db/datetime';
	import {
		ArrowDown,
		ArrowRightLeft,
		ArrowUp,
		CalendarClock,
		CalendarDays,
		Info,
		MoreVertical,
		Pencil,
		Star,
		Trash2
	} from 'lucide-svelte';
	import { DateTime } from 'luxon';
	import { Badge, MenuItem, Popover } from '$lib/components/ui';
	import { formatDate } from '$lib/format';
	import { cn } from '$lib/utils';
	import { t } from '$lib/i18n.svelte';
	import { resolve } from '$app/paths';

	interface Props {
		item: ChecklistItem;
		/** Bare trip ULID (for the day-link chip). */
		tripId: string;
		/** Large tap targets for the "To buy" shopping view. */
		large?: boolean;
		canMoveUp?: boolean;
		canMoveDown?: boolean;
		ontoggle: (item: ChecklistItem) => void;
		onedit: (item: ChecklistItem) => void;
		onmoveup?: (item: ChecklistItem) => void;
		onmovedown?: (item: ChecklistItem) => void;
		onmovegroup?: (item: ChecklistItem) => void;
		ondelete: (item: ChecklistItem) => void;
	}

	let {
		item,
		tripId,
		large = false,
		canMoveUp = false,
		canMoveDown = false,
		ontoggle,
		onedit,
		onmoveup,
		onmovedown,
		onmovegroup,
		ondelete
	}: Props = $props();

	let menuOpen = $state(false);
	let noteOpen = $state(false);
	/*
	 * An optimistic mirror of `item.done`: the checkbox flips immediately, and
	 * the assignment below clears the override as soon as the parent re-renders
	 * with the persisted item. A writable `$derived` avoids the extra render
	 * `$state` + `$effect` costs, and cannot drift on first paint.
	 */
	let localDone = $derived(item.done);

	const cbId = $derived(`chk-${item._id}`);

	const dueInfo = $derived.by(() => {
		if (!item.dueDate) return null;
		const delta = dayDelta(todayIso(), item.dueDate);
		const overdue = !localDone && delta < 0;
		const near = !localDone && delta >= 0 && delta <= 3;
		return { label: formatDate(item.dueDate), amber: overdue || near, overdue };
	});

	function dayChipLabel(date: string): string {
		const dt = DateTime.fromISO(date);
		return dt.isValid ? dt.toFormat('ccc d LLL') : date;
	}

	const ariaLabel = $derived.by(() => {
		const parts: string[] = [item.text ?? t('untitled')];
		if (item.quantity && item.quantity > 1) parts.push(`${t('quantity')} ${item.quantity}`);
		if (item.important) parts.push(t('important'));
		if (item.dueDate)
			parts.push(`${dueInfo?.overdue ? t('overdue') : t('due')} ${formatDate(item.dueDate)}`);
		parts.push(t(localDone ? 'done' : 'not_done'));
		return parts.join(', ');
	});

	function action(fn?: (item: ChecklistItem) => void) {
		menuOpen = false;
		fn?.(item);
	}

	function handleToggle() {
		localDone = !localDone;
		ontoggle({ ...item, done: localDone });
	}
</script>

<li class="border-b border-border/60 last:border-b-0">
	<div class="flex items-start gap-2.5 py-1.5">
		<label
			for={cbId}
			class="-my-2 -ml-2 grid min-h-touch min-w-touch shrink-0 cursor-pointer place-items-center"
		>
			<input
				id={cbId}
				type="checkbox"
				checked={localDone}
				onchange={handleToggle}
				aria-label={ariaLabel}
				class={cn(
					'rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30',
					large ? 'size-6' : 'size-5'
				)}
			/>
		</label>
		<div class="min-w-0 flex-1 pt-1 sm:pt-0.5">
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
				<button
					type="button"
					onclick={() => onedit(item)}
					class={cn(
						'text-left font-medium transition-colors hover:text-primary-700',
						large ? 'text-base' : 'text-sm',
						localDone ? 'text-ink-muted line-through' : 'text-ink'
					)}
				>
					{item.text ?? t('untitled')}
				</button>
				{#if item.important}
					<Star
						class="size-4 shrink-0 fill-accent-amber text-accent-amber"
						aria-label={t('important')}
					/>
				{/if}
				{#if item.quantity && item.quantity > 1}
					<Badge variant="neutral" class="tabular-nums">{item.quantity}</Badge>
				{/if}
				{#if dueInfo}
					<Badge variant={dueInfo.amber ? 'warning' : 'neutral'}>
						<CalendarClock class="size-3" />
						{dueInfo.overdue ? t('overdue') : t('due')}
						{dueInfo.label}
					</Badge>
				{/if}
				{#if item.date}
					<a href={resolve(`/trip/${tripId}/itinerary?date=${item.date}`)} class="inline-flex">
						<Badge variant="primary"
							><CalendarDays class="size-3" /> {dayChipLabel(item.date)}</Badge
						>
					</a>
				{/if}
				{#if item.note}
					<button
						type="button"
						onclick={() => (noteOpen = !noteOpen)}
						aria-expanded={noteOpen}
						aria-label={noteOpen ? t('hide_note') : t('show_note')}
						class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-xs"
					>
						<Info />
						{t('note')}
					</button>
				{/if}
			</div>
			{#if noteOpen && item.note}
				<p class="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{item.note}</p>
			{/if}
		</div>

		<Popover bind:open={menuOpen} label={t('item_actions')} align="end">
			{#snippet trigger({ toggle, open })}
				<button
					type="button"
					onclick={toggle}
					aria-label={t('item_actions')}
					aria-haspopup="true"
					aria-expanded={open}
					class="grid size-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken sm:size-8 sm:min-h-0 sm:min-w-0 [&_svg]:size-5 sm:[&_svg]:size-4"
				>
					<MoreVertical />
				</button>
			{/snippet}
			<MenuItem icon={Pencil} onclick={() => action(onedit)}>{t('edit')}</MenuItem>
			<MenuItem icon={ArrowUp} disabled={!canMoveUp} onclick={() => action(onmoveup)}
				>{t('move_up')}</MenuItem
			>
			<MenuItem icon={ArrowDown} disabled={!canMoveDown} onclick={() => action(onmovedown)}>
				{t('move_down')}
			</MenuItem>
			<MenuItem icon={ArrowRightLeft} onclick={() => action(onmovegroup)}
				>{t('move_to_group_ellipsis')}</MenuItem
			>
			<MenuItem icon={Trash2} tone="danger" onclick={() => action(ondelete)}>{t('delete')}</MenuItem
			>
		</Popover>
	</div>
</li>
