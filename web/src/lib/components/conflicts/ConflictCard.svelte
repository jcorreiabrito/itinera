<script lang="ts">
	/**
	 * One resolved conflict, with the losing values recoverable field by field.
	 *
	 * The resolution itself is whole-document last-writer-wins, so by the time a
	 * conflict appears here the losing revision is no longer in the live tree —
	 * only in the local retention log. Showing the field *names* (as this screen
	 * used to) tells the reader that something changed without telling them
	 * what, which is not enough to decide whether to recover it. So each field
	 * shows both values and the reader picks.
	 */
	import { listConflicts, markConflictReviewed, restoreConflictFields } from '$lib/db';
	import { t, type TranslationKey } from '$lib/i18n.svelte';
	import { Badge, Button, Dialog, toast } from '$lib/components/ui';
	import { relativeTime } from '$lib/format';

	type Report = Awaited<ReturnType<typeof listConflicts>>[number];
	type StoredDoc = Report['winner'];
	type Choice = 'winner' | 'loser';

	interface Props {
		report: Report;
		/** The trip this record belongs to, for the line under its name. */
		context: string;
		/** Called after a restore or a dismissal, so the page can reload. */
		onresolved: () => void;
	}

	let { report, context, onresolved }: Props = $props();

	const TYPE_LABELS: Record<string, TranslationKey> = {
		trip: 'label_trip',
		tripDay: 'label_itinerary_day',
		itineraryItem: 'label_itinerary_item',
		checklistItem: 'label_checklist_item',
		checklistTemplate: 'label_checklist_template',
		flight: 'label_flight_booking',
		reservation: 'label_reservation',
		expense: 'label_expense',
		attachment: 'label_attachment',
		settings: 'settings'
	};

	/** Metadata, not content: showing it as a choice would be noise. */
	const IGNORED = new Set([
		'type',
		'tripid',
		'_schemaVersion',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'order'
	]);

	/*
	 * Selections, keyed `loserRev:field`. A plain object in `$state` is a deep
	 * proxy in Svelte 5, so assigning into a nested map is reactive without
	 * rebuilding the whole structure on every click.
	 */
	let choices = $state<Record<string, Choice>>({});
	let busy = $state(false);

	function typeLabel(doc: StoredDoc): string {
		const key = TYPE_LABELS[doc.type ?? ''];
		return key ? t(key) : t('label_record');
	}

	function docName(doc: StoredDoc): string {
		const d = doc as Record<string, unknown>;
		return ((d.title as string) ?? (d.name as string) ?? (d.description as string) ?? '').trim();
	}

	function humanize(key: string): string {
		return key
			.replace(/([a-z])([A-Z])/g, '$1 $2')
			.replace(/_/g, ' ')
			.replace(/^./, (c) => c.toUpperCase());
	}

	/** The fields that actually differ between the kept and the set-aside copy. */
	function changedFields(winner: StoredDoc, loser: StoredDoc): string[] {
		const w = winner as Record<string, unknown>;
		const l = loser as Record<string, unknown>;
		const out: string[] = [];
		for (const key of new Set([...Object.keys(w), ...Object.keys(l)])) {
			if (key.startsWith('_') || IGNORED.has(key)) continue;
			if (JSON.stringify(w[key]) !== JSON.stringify(l[key])) out.push(key);
		}
		return out;
	}

	/**
	 * A value as a person reads it. Objects and arrays are JSON, truncated:
	 * a list of destinations is legitimately long, and the full text belongs in
	 * the field's own screen, not in a comparison cell.
	 */
	function display(value: unknown): string {
		if (value === null || value === undefined || value === '') return t('conflict_empty_value');
		if (typeof value === 'string') return value;
		if (typeof value === 'number' || typeof value === 'boolean') return String(value);
		try {
			const text = JSON.stringify(value);
			return text.length > 140 ? `${text.slice(0, 137)}…` : text;
		} catch {
			return String(value);
		}
	}

	const key = (rev: string, field: string) => `${rev}:${field}`;
	const choiceFor = (rev: string, field: string): Choice => choices[key(rev, field)] ?? 'winner';

	function choose(rev: string, field: string, value: Choice): void {
		choices[key(rev, field)] = value;
	}

	function selected(rev: string, fields: string[]): string[] {
		return fields.filter((field) => choiceFor(rev, field) === 'loser');
	}

	async function restore(loserRev: string, fields: string[]): Promise<void> {
		const picked = selected(loserRev, fields);
		if (!picked.length) return;
		busy = true;
		try {
			await restoreConflictFields(report.id, loserRev, picked);
			toast.success(t('conflict_restored'));
			onresolved();
		} catch {
			toast.error(t('conflict_restore_failed'));
		} finally {
			busy = false;
		}
	}

	/*
	 * Discarding is irreversible: the retained losing bodies live only in the
	 * device-local log, and `markConflictReviewed` deletes that entry. The help
	 * text promises the replaced versions are kept, so the button says what it
	 * destroys and a confirmation stands between it and the deletion.
	 */
	let confirmDiscardOpen = $state(false);

	async function discard(): Promise<void> {
		confirmDiscardOpen = false;
		busy = true;
		try {
			await markConflictReviewed(report.id);
			toast.success(t('saved_versions_discarded'));
			onresolved();
		} catch {
			toast.error(t('could_not_update_retry'));
		} finally {
			busy = false;
		}
	}
</script>

<article class="rounded-lg border border-border bg-surface p-4 shadow-soft">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="neutral">{typeLabel(report.winner)}</Badge>
				{#if docName(report.winner)}
					<span class="truncate font-medium text-ink">{docName(report.winner)}</span>
				{/if}
			</div>
			{#if context}
				<p class="mt-1 text-xs text-ink-muted">{context}</p>
			{/if}
			<p class="mt-1.5 text-sm text-ink">
				{t('kept_version_saved', {
					time: relativeTime(report.winner.updatedAt) || t('most_recently')
				})}
			</p>
		</div>
		<Button
			variant="secondary"
			size="sm"
			onclick={() => (confirmDiscardOpen = true)}
			disabled={busy}
		>
			{t('discard_saved_versions')}
		</Button>
	</div>

	<div class="mt-3 space-y-3 border-t border-border pt-3">
		{#each report.losers as loser (loser._rev)}
			{@const fields = changedFields(report.winner, loser)}
			<div class="rounded-lg border border-border bg-surface-sunken/40 p-3">
				<p class="text-xs text-ink">
					<span class="font-medium">{t('set_aside')}</span>
					· {t('edited_at', { time: relativeTime(loser.updatedAt) || '' })}
					{#if fields.length}
						· {t('conflict_fields_differ', { n: String(fields.length) })}
					{:else}
						· {t('conflict_identical')}
					{/if}
				</p>

				{#if fields.length}
					<p class="mt-1 text-xs text-ink-muted">{t('conflict_choose_values')}</p>

					<ul class="mt-2 space-y-2">
						{#each fields as field (field)}
							<li
								class="grid gap-1.5 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-2"
							>
								<span class="text-xs font-medium text-ink-muted">{humanize(field)}</span>

								<label class="cursor-pointer">
									<input
										type="radio"
										class="peer sr-only"
										name={`${loser._rev}-${field}`}
										checked={choiceFor(loser._rev, field) === 'winner'}
										onchange={() => choose(loser._rev, field, 'winner')}
									/>
									<span
										class="block break-words rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink transition-colors peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-600 peer-focus-visible:ring-offset-1"
										title={display((report.winner as Record<string, unknown>)[field])}
									>
										<span class="sr-only">{t('conflict_kept_value')}: </span>
										{display((report.winner as Record<string, unknown>)[field])}
									</span>
								</label>

								<label class="cursor-pointer">
									<input
										type="radio"
										class="peer sr-only"
										name={`${loser._rev}-${field}`}
										checked={choiceFor(loser._rev, field) === 'loser'}
										onchange={() => choose(loser._rev, field, 'loser')}
									/>
									<span
										class="block break-words rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-ink transition-colors peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-600 peer-focus-visible:ring-offset-1"
										title={display((loser as Record<string, unknown>)[field])}
									>
										<span class="sr-only">{t('conflict_other_value')}: </span>
										{display((loser as Record<string, unknown>)[field])}
									</span>
								</label>
							</li>
						{/each}
					</ul>

					<div class="mt-3 flex justify-end">
						<Button
							size="sm"
							disabled={busy || selected(loser._rev, fields).length === 0}
							onclick={() => restore(loser._rev, fields)}
						>
							{busy ? t('conflict_restoring') : t('conflict_restore_selected')}
						</Button>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</article>

<Dialog bind:open={confirmDiscardOpen} title={t('discard_saved_versions')}>
	<p class="text-sm text-ink-muted">{t('discard_saved_versions_confirm')}</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmDiscardOpen = false)}>{t('cancel')}</Button>
		<Button variant="destructive" onclick={discard}>{t('discard')}</Button>
	{/snippet}
</Dialog>
