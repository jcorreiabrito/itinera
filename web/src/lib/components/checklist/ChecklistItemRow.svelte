<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { ChecklistItem } from '$lib/db';
	import { dayDelta, todayIso } from '$lib/db/datetime';
	import {
		ArrowDown,
		ArrowRightLeft,
		ArrowUp,
		CalendarClock,
		CalendarDays,
		Check,
		Info,
		MoreVertical,
		Pencil,
		RotateCcw,
		Star,
		Trash2
	} from 'lucide-svelte';
	import { DateTime } from 'luxon';
	import { Badge, MenuItem, Popover } from '$lib/components/ui';
	import { formatDate } from '$lib/format';
	import { clampSwipeOffset, swipeDirection, type SwipeDirection } from '$lib/gestures';
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
		/**
		 * Swipe right marks an open item done; swipe left reopens a done one.
		 * Omit on surfaces where a horizontal gesture means something else.
		 */
		onswipe?: (item: ChecklistItem, direction: SwipeDirection) => void;
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
		ondelete,
		onswipe
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

	/*
	 * Swipe is a shortcut, never the only way to do something: the checkbox is
	 * still the accessible, discoverable control and keeps its label. The row
	 * translates under the pointer only after the gesture is clearly horizontal,
	 * so a vertical drag still scrolls the list and a tap still edits the item.
	 */
	const SWIPE_THRESHOLD = 56;
	const SWIPE_MAX = 96;
	let swipeX = $state(0);
	let swiping = $state(false);
	let swipeStart: { id: number; x: number; y: number } | null = null;
	let clickGuard: { handler: (event: Event) => void; timer: number } | null = null;

	function onPointerDown(event: PointerEvent) {
		if (!onswipe) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		if (event.isPrimary === false || swipeStart) return;
		swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
		swiping = false;
		window.addEventListener('pointermove', onPointerMove, { passive: true });
		window.addEventListener('pointerup', onPointerUp);
		window.addEventListener('pointercancel', onPointerCancel);
	}

	/**
	 * Translation before release, with the direction the gesture is heading.
	 * A no-op direction (swiping an already-done item right) is damped rather
	 * than blocked, so the row says "nothing to do here" before the finger
	 * leaves the screen.
	 */
	function onPointerMove(event: PointerEvent) {
		const start = swipeStart;
		if (!start || event.pointerId !== start.id) return;
		const dx = event.clientX - start.x;
		const dy = event.clientY - start.y;
		if (!swiping) {
			// The browser has not cancelled us: the gesture is still in play.
			if (Math.abs(dy) > 14 && Math.abs(dy) >= Math.abs(dx)) {
				finishSwipe();
				return;
			}
			if (Math.abs(dx) < 14 || Math.abs(dx) <= Math.abs(dy)) return;
			swiping = true;
		}
		const noop = dx > 0 === localDone;
		swipeX = clampSwipeOffset(noop ? dx * 0.25 : dx, SWIPE_MAX);
	}

	function onPointerUp(event: PointerEvent) {
		const start = swipeStart;
		if (!start || event.pointerId !== start.id) return;
		const dx = event.clientX - start.x;
		const dy = event.clientY - start.y;
		const wasSwiping = swiping;
		finishSwipe();
		if (!wasSwiping) return;

		const direction = swipeDirection(dx, dy, SWIPE_THRESHOLD);
		if (!direction) return;
		suppressNextClick();
		if (direction === 'right' ? localDone : !localDone) return;
		onswipe?.(item, direction);
	}

	function onPointerCancel() {
		finishSwipe();
	}

	function finishSwipe() {
		if (swipeStart) {
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
			window.removeEventListener('pointercancel', onPointerCancel);
		}
		swipeStart = null;
		swiping = false;
		swipeX = 0;
	}

	/*
	 * A completed swipe still produces a click on whatever was under the finger.
	 * One capture-phase listener swallows exactly that click and removes itself
	 * in the same task; the timer is the fallback for browsers that never send it.
	 */
	function suppressNextClick() {
		releaseClickGuard();
		const handler = (event: Event) => {
			event.preventDefault();
			event.stopPropagation();
			releaseClickGuard();
		};
		document.addEventListener('click', handler, true);
		const timer = window.setTimeout(() => {
			if (clickGuard?.handler === handler) releaseClickGuard();
		}, 0);
		clickGuard = { handler, timer };
	}

	function releaseClickGuard() {
		if (!clickGuard) return;
		document.removeEventListener('click', clickGuard.handler, true);
		clearTimeout(clickGuard.timer);
		clickGuard = null;
	}

	onDestroy(() => {
		finishSwipe();
		releaseClickGuard();
	});
</script>

<li class="relative overflow-hidden border-b border-border/60 last:border-b-0">
	{#if onswipe}
		<!-- Revealed by translating the row: right = done, left = reopen. -->
		<div
			class="pointer-events-none absolute inset-0 flex items-center justify-between bg-surface-sunken px-4"
			aria-hidden="true"
		>
			<span class="inline-flex items-center gap-1.5 text-sm font-medium capitalize text-success">
				<Check class="size-4" />
				{t('done')}
			</span>
			<span class="inline-flex items-center gap-1.5 text-sm font-medium capitalize text-ink-muted">
				<RotateCcw class="size-4" />
				{t('not_done')}
			</span>
		</div>
	{/if}
	<!-- The gesture duplicates the checkbox; it adds no interaction of its own. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class={cn(
			'density-row relative flex items-start gap-2.5 py-1.5',
			onswipe && 'touch-pan-y bg-surface',
			swiping ? 'select-none' : 'transition-transform duration-150'
		)}
		style:transform={swipeX ? `translateX(${swipeX}px)` : undefined}
		onpointerdown={onPointerDown}
	>
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
