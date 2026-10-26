<script lang="ts">
	import { MousePointerClick, Plus, X } from 'lucide-svelte';
	import type { Flight, ItineraryItem, Reservation } from '$lib/db';
	import { Button, Dialog } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import ItineraryItemForm from './ItineraryItemForm.svelte';

	/*
	 * The wide workspace's right pane: the editor docked beside the plan.
	 *
	 * It is deliberately not a dialog. Nothing here traps focus or covers the
	 * timeline — the point of the three-pane layout is that the day, the map and
	 * the form stay visible together. The sheet remains the editor below `xl`.
	 */

	interface Props {
		/** Whether an item (or a new one) is being edited. */
		open: boolean;
		mode: 'create' | 'edit';
		/** Bare trip ULID. */
		tripId: string;
		item: ItineraryItem | null;
		/** Default day for a new item (`null` = Unscheduled). */
		defaultDate: string | null;
		dates: string[];
		flights?: Flight[];
		reservations?: Reservation[];
		homeCurrency?: string;
		onsaved?: () => void;
		onclose: () => void;
		/** Called after a discard, when the caller wants focus back on the rail. */
		onclosed?: () => void;
		oncreate: () => void;
	}

	let {
		open,
		mode,
		tripId,
		item,
		defaultDate,
		dates,
		flights = [],
		reservations = [],
		homeCurrency = 'EUR',
		onsaved,
		onclose,
		onclosed,
		oncreate
	}: Props = $props();

	let formSaving = $state(false);
	let formDirty = $state(false);
	let formRef = $state<{ save: () => Promise<void> } | null>(null);
	// The docked editor has no Sheet around it to run the discard guard, so it
	// carries the same prompt here. Escape and the X must not be a faster way
	// to lose a draft than closing the sheet is.
	let discardOpen = $state(false);

	/**
	 * Close from a user gesture, guarding a draft.
	 *
	 * Returns false when the discard prompt took over, so a page-level Escape
	 * handler knows not to move focus to the rail while the prompt is open.
	 */
	export function requestClose(): boolean {
		if (formSaving) return false;
		if (formDirty) {
			discardOpen = true;
			return false;
		}
		onclose();
		return true;
	}

	function discardChanges() {
		discardOpen = false;
		onclose();
		onclosed?.();
	}
</script>

<aside
	aria-labelledby="itinerary-inspector-heading"
	class="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-soft"
>
	<header class="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
		<div class="min-w-0">
			<h2 id="itinerary-inspector-heading" class="font-serif text-base font-semibold text-ink">
				{t('workspace_inspector')}
			</h2>
			<p class="truncate text-xs text-ink-muted">
				{#if open}
					{mode === 'create' ? t('add_activity') : item?.title?.trim() || t('edit_activity')}
				{:else}
					{t('workspace_select_item')}
				{/if}
			</p>
		</div>
		{#if open}
			<button
				type="button"
				onclick={requestClose}
				aria-label={t('close')}
				class="grid size-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95"
			>
				<X class="size-4" />
			</button>
		{/if}
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
		{#if open}
			<ItineraryItemForm
				bind:this={formRef}
				active={open}
				{mode}
				{tripId}
				{item}
				{defaultDate}
				{dates}
				{flights}
				{reservations}
				{homeCurrency}
				bind:dirty={formDirty}
				bind:saving={formSaving}
				{onsaved}
				ondone={onclose}
			/>
		{:else}
			<div class="flex flex-col items-center px-2 py-10 text-center">
				<span
					class="grid size-12 place-items-center rounded-full bg-surface-sunken text-ink-muted"
					aria-hidden="true"
				>
					<MousePointerClick class="size-6" />
				</span>
				<p class="mt-3 text-sm font-medium text-ink">{t('workspace_select_item')}</p>
				<p class="mt-1 text-xs text-ink-muted">{t('workspace_select_item_desc')}</p>
				<Button class="mt-4" size="sm" onclick={oncreate}>
					<Plus class="size-4" />
					{t('add_activity')}
				</Button>
			</div>
		{/if}
	</div>

	{#if open}
		<footer class="pb-safe flex items-center justify-end gap-2 border-t border-border px-3 py-3">
			<Button variant="ghost" onclick={requestClose} disabled={formSaving}>{t('cancel')}</Button>
			<Button onclick={() => formRef?.save()} disabled={formSaving}>
				{formSaving ? t('saving') : mode === 'create' ? t('add_activity') : t('save_changes')}
			</Button>
		</footer>
	{/if}
</aside>

<Dialog bind:open={discardOpen} title={t('discard_unsaved_title')}>
	<p class="text-sm text-ink-muted">{t('discard_unsaved_body')}</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (discardOpen = false)}>{t('keep_editing')}</Button>
		<Button variant="destructive" onclick={discardChanges}>{t('discard')}</Button>
	{/snippet}
</Dialog>
