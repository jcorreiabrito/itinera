<script lang="ts">
	import { Sheet, Button } from '$lib/components/ui';
	import type { TripUpdateDiff } from '$lib/db/importer';
	import { PlusCircle, Edit3, Trash2, CheckCircle2 } from 'lucide-svelte';
	import { t } from '$lib/i18n.svelte';

	interface Props {
		open?: boolean;
		diff?: TripUpdateDiff | null;
		onconfirm?: () => Promise<void> | void;
	}

	let { open = $bindable(false), diff = null, onconfirm }: Props = $props();

	let saving = $state(false);

	/** The two fields of a flight segment this sheet reads off an incoming doc. */
	interface FlightSegmentInput {
		from?: { code?: string };
		to?: { code?: string };
	}

	/** A short "Type: name" label for one record in the incoming diff. */
	function getItemLabel(doc: Record<string, unknown>): string {
		const title = (doc.title as string) || t('untitled');
		switch (doc.type) {
			case 'trip':
				return `${t('label_trip')}: ${title}`;
			case 'tripDay':
				return `${t('label_day')}: ${(doc.date as string) || (doc.title as string) || t('label_day')}`;
			case 'itineraryItem':
				return `${t('label_activity')}: ${title}`;
			case 'flight': {
				const seg = (doc.segments as FlightSegmentInput[] | undefined)?.[0];
				const route = seg ? `${seg.from?.code || ''} → ${seg.to?.code || ''}` : t('flights');
				return `${t('label_flight_booking')}: ${route}`;
			}
			case 'reservation':
				return `${t('label_reservation')}: ${(doc.name as string) || title}`;
			case 'expense':
				return `${t('label_expense')}: ${(doc.description as string) || (doc.category as string) || t('label_expense')}`;
			case 'checklistItem':
				return `${t('checklist')}: ${(doc.text as string) || t('label_item')}`;
			default:
				return `${(doc.type as string) || t('label_document')}`;
		}
	}

	async function handleConfirm() {
		if (!onconfirm) return;
		saving = true;
		try {
			await onconfirm();
			open = false;
		} finally {
			saving = false;
		}
	}
</script>

<Sheet
	bind:open
	side="right"
	title={t('review_json_changes')}
	description={t('review_json_changes_desc')}
>
	{#if !diff}
		<div class="p-4 text-center text-sm text-ink-muted">{t('no_diff_available')}</div>
	{:else if diff.isNoOp}
		<div class="flex flex-col items-center justify-center gap-3 p-8 text-center">
			<CheckCircle2 class="size-10 text-emerald-500" />
			<p class="font-medium text-ink">{t('no_changes_detected')}</p>
			<p class="text-xs text-ink-muted">{t('json_identical_to_trip')}</p>
		</div>
	{:else}
		<div class="flex flex-col gap-5 py-2">
			<!-- Added Section -->
			{#if diff.added.length > 0}
				<div class="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
					<div class="flex items-center gap-2 text-sm font-semibold text-emerald-800">
						<PlusCircle class="size-4 text-emerald-600" />
						<span>{t('to_add_count', { n: String(diff.added.length) })}</span>
					</div>
					<ul class="flex flex-col gap-1.5 pl-6 text-xs text-emerald-950">
						{#each diff.added as item (item._id)}
							<li class="list-disc">{getItemLabel(item)}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Updated Section -->
			{#if diff.updated.length > 0}
				<div class="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
					<div class="flex items-center gap-2 text-sm font-semibold text-amber-800">
						<Edit3 class="size-4 text-amber-600" />
						<span>{t('to_update_count', { n: String(diff.updated.length) })}</span>
					</div>
					<ul class="flex flex-col gap-1.5 pl-6 text-xs text-amber-950">
						{#each diff.updated as item (item._id)}
							<li class="list-disc">{getItemLabel(item)}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Removed Section -->
			{#if diff.removed.length > 0}
				<div class="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
					<div class="flex items-center gap-2 text-sm font-semibold text-rose-800">
						<Trash2 class="size-4 text-rose-600" />
						<span>{t('to_remove_count', { n: String(diff.removed.length) })}</span>
					</div>
					<p class="text-[0.7rem] text-rose-700">
						{t('missing_items_to_trash')}
					</p>
					<ul class="flex flex-col gap-1.5 pl-6 text-xs text-rose-950">
						{#each diff.removed as item (item._id)}
							<li class="list-disc">{getItemLabel(item)}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)} disabled={saving}>{t('cancel')}</Button>
		<Button onclick={handleConfirm} disabled={!diff || diff.isNoOp || saving}>
			{saving ? t('updating') : t('confirm_update')}
		</Button>
	{/snippet}
</Sheet>
