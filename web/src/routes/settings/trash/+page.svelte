<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { settings, trash } from '$lib/db';
	import { t, type TranslationKey } from '$lib/i18n.svelte';
	import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-svelte';
	import {
		Badge,
		Button,
		Checkbox,
		Dialog,
		EmptyState,
		Select,
		Skeleton,
		SyncStatusPill,
		toast
	} from '$lib/components/ui';
	import { relativeTime } from '$lib/format';
	import { startLive } from '$lib/live';

	type Entry = Awaited<ReturnType<typeof trash.list>>[number];
	type Group = Awaited<ReturnType<typeof trash.listGrouped>>['groups'][number];

	let loaded = $state(false);
	/* Grouped by trip: the trip's own row is the one whose restore cascades, so it
	 * belongs at the top of its own block, not somewhere in a flat list. */
	let groups = $state<Group[]>([]);
	let loose = $state<Entry[]>([]);
	let selected = $state<Record<string, boolean>>({});
	let working = $state(false);

	// Confirmation for destructive purges.
	let confirm = $state<{ kind: 'one' | 'many' | 'all'; ids: string[]; label?: string } | null>(
		null
	);

	/** 0 means "keep deleted items forever", which is the default. */
	const RETENTION_CHOICES = [0, 30, 90, 365] as const;
	let retention = $state(0);
	let retentionSaving = $state(false);
	/** A window the user picked that would delete things already in the Trash. */
	let pendingRetention = $state<number | null>(null);

	/** The trip row first (when trashed), then its children. */
	function groupEntries(group: Group): Entry[] {
		return group.trip ? [group.trip, ...group.entries] : group.entries;
	}

	function groupIds(group: Group): string[] {
		return groupEntries(group).map((e) => e.id);
	}

	async function load() {
		try {
			const listing = await trash.listGrouped();
			groups = listing.groups;
			loose = listing.loose;
			// Drop selection entries that no longer exist.
			const present = new Set([...groups.flatMap(groupIds), ...loose.map((e) => e.id)]);
			selected = Object.fromEntries(
				Object.entries(selected).filter(([id, on]) => on && present.has(id))
			);
		} catch {
			toast.error(t('could_not_load_trash'));
		} finally {
			loaded = true;
		}
	}

	onMount(() => {
		load();
		settings
			.get()
			.then((s) => (retention = s.trashRetentionDays ?? 0))
			.catch(() => {
				/* the read-through creates the document; if it fails the default of
				   "keep forever" is what the app runs with anyway */
			});
		return startLive(load);
	});

	/**
	 * How many of the entries on screen a window would remove right now.
	 *
	 * Counted from the listing already in memory rather than with a second query,
	 * so the number in the prompt is the number of rows the user can see.
	 */
	function expiringCount(days: number): number {
		if (!days) return 0;
		const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
		const all = [...groups.flatMap(groupEntries), ...loose];
		return all.filter((entry) => entry.deletedAt && entry.deletedAt < cutoff).length;
	}

	async function chooseRetention(days: number) {
		if (days === retention) return;
		// A window that reaches back past something already waiting would empty
		// part of the Trash on the spot, so it is asked about, not applied.
		if (expiringCount(days) > 0) {
			pendingRetention = days;
			return;
		}
		await saveRetention(days);
	}

	async function saveRetention(days: number) {
		pendingRetention = null;
		retentionSaving = true;
		try {
			await settings.update({ trashRetentionDays: days });
			retention = days;
			const purged = days > 0 ? await trash.purgeExpired(days) : 0;
			if (purged > 0) {
				toast.success(t('trash_retention_purged', { n: String(purged) }));
				await load();
			} else {
				toast.success(t('trash_retention_saved'));
			}
		} catch {
			toast.error(t('could_not_save_retention'));
		} finally {
			retentionSaving = false;
		}
	}

	/** "Never" / "30 days" – the label for one choice in the retention Select. */
	function retentionLabel(days: number): string {
		return days === 0 ? t('trash_retention_never') : t('trash_retention_days', { n: String(days) });
	}

	const TYPE_LABELS: Record<string, TranslationKey> = {
		trip: 'trips',
		tripDay: 'itinerary',
		itineraryItem: 'itinerary',
		checklistItem: 'checklist',
		checklistTemplate: 'checklist_templates',
		flight: 'flights',
		reservation: 'reservations',
		expense: 'costs',
		attachment: 'attachments'
	};

	function groupLabel(type: string): string {
		const key = TYPE_LABELS[type ?? ''];
		return key ? t(key) : t('cat_other');
	}

	/** "Expense · deleted 3 days ago" – what it is, and when it went. */
	function entryDescription(entry: Entry): string {
		const kind = groupLabel(entry.type ?? '');
		return entry.deletedAt
			? `${kind} · ${t('deleted_at', { time: relativeTime(entry.deletedAt) })}`
			: kind;
	}

	const totalCount = $derived(
		groups.reduce((n, group) => n + groupEntries(group).length, 0) + loose.length
	);

	const selectedIds = $derived(Object.keys(selected).filter((id) => selected[id]));
	const selectedCount = $derived(selectedIds.length);

	function toggle(id: string, on: boolean) {
		selected = { ...selected, [id]: on };
	}

	async function restore(ids: string[]) {
		if (!ids.length) return;
		working = true;
		try {
			await trash.restoreMany(ids);
			toast.success(
				ids.length === 1 ? t('restored_single') : t('restored_plural', { n: String(ids.length) })
			);
			selected = {};
			await load();
		} catch {
			toast.error(t('could_not_restore'));
		} finally {
			working = false;
		}
	}

	function askPurge(kind: 'one' | 'many' | 'all', ids: string[], label?: string) {
		confirm = { kind, ids, label };
	}

	async function doPurge() {
		if (!confirm) return;
		const { kind, ids } = confirm;
		confirm = null;
		working = true;
		try {
			if (kind === 'all') {
				const n = await trash.empty();
				toast.success(
					n ? t('deleted_permanently_plural', { n: String(n) }) : t('trash_already_empty')
				);
			} else {
				await trash.purgeMany(ids);
				toast.success(
					ids.length === 1
						? t('deleted_permanently_single')
						: t('deleted_permanently_plural', { n: String(ids.length) })
				);
			}
			selected = {};
			await load();
		} catch {
			toast.error(t('could_not_delete'));
		} finally {
			working = false;
		}
	}

	const confirmTitle = $derived(
		confirm?.kind === 'all'
			? t('empty_trash')
			: confirm?.kind === 'many'
				? t('delete_many_forever_title', { n: String(confirm.ids.length) })
				: t('delete_forever_confirm_title')
	);
</script>

<svelte:head>
	<title>{t('trash_title')}</title>
</svelte:head>

<header class="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
	<div class="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
		<div class="flex items-center gap-2">
			<a
				href={resolve('/settings')}
				aria-label={t('settings')}
				class="grid size-11 min-h-[44px] min-w-[44px] place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 sm:size-9 sm:min-h-0 sm:min-w-0 [&_svg]:size-5"
			>
				<ArrowLeft />
			</a>
			<h1 class="font-serif text-xl font-semibold">{t('trash')}</h1>
		</div>
		<SyncStatusPill />
	</div>
</header>

<main id="page-content" class="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
	<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
		<p class="text-sm text-ink-muted">
			{t('trash_help_text')}
		</p>
		{#if totalCount > 0}
			<Button
				variant="ghost"
				size="sm"
				class="text-danger hover:bg-danger/10"
				onclick={() => askPurge('all', [...groups.flatMap(groupIds), ...loose.map((e) => e.id)])}
				disabled={working}
			>
				<Trash2 class="size-4" />
				{t('empty_trash')}
			</Button>
		{/if}
	</div>

	<div
		class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
	>
		<div class="min-w-0">
			<label for="trash-retention" class="text-sm font-medium text-ink">
				{t('trash_retention')}
			</label>
			<p class="mt-0.5 text-xs leading-relaxed text-ink-muted">
				{t('trash_retention_desc')}
			</p>
		</div>
		<div class="w-full sm:w-44">
			<Select
				id="trash-retention"
				value={String(retention)}
				disabled={retentionSaving}
				onchange={(e) => chooseRetention(Number(e.currentTarget.value))}
			>
				{#each RETENTION_CHOICES as days (days)}
					<option value={String(days)}>{retentionLabel(days)}</option>
				{/each}
			</Select>
		</div>
	</div>

	{#if !loaded}
		<div class="space-y-4">
			<Skeleton class="h-[4.5rem] w-48 rounded-lg" />
			<Skeleton class="h-16 w-full rounded-lg" />
			<Skeleton class="h-16 w-full rounded-lg" />
		</div>
	{:else if totalCount === 0}
		<EmptyState icon={Trash2} title={t('trash_is_empty')} description={t('trash_empty_desc')} />
	{:else}
		<div class="space-y-6">
			{#each groups as group (group.tripId)}
				<section aria-label={group.title ?? t('untitled')}>
					<div class="mb-2 flex items-center justify-between gap-2">
						<h2 class="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
							<span class="truncate">{group.title ?? t('untitled')}</span>
							<Badge variant="neutral">{groupEntries(group).length}</Badge>
						</h2>
						<div class="flex shrink-0 items-center gap-1">
							<button
								type="button"
								onclick={() => restore(groupIds(group))}
								disabled={working}
								aria-label={t('restore_all')}
								title={t('restore_all')}
								class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-50 [&_svg]:size-4"
							>
								<RotateCcw />
							</button>
							<button
								type="button"
								onclick={() => askPurge('many', groupIds(group), group.title ?? undefined)}
								disabled={working}
								aria-label={t('delete_all_forever')}
								title={t('delete_all_forever')}
								class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50 [&_svg]:size-4"
							>
								<Trash2 />
							</button>
						</div>
					</div>
					<ul
						class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
					>
						{#each groupEntries(group) as entry (entry.id)}
							{@render row(entry)}
						{/each}
					</ul>
				</section>
			{/each}

			{#if loose.length}
				<section aria-label={t('ungrouped')}>
					<h2 class="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-muted">
						{t('ungrouped')}
						<Badge variant="neutral">{loose.length}</Badge>
					</h2>
					<ul
						class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
					>
						{#each loose as entry (entry.id)}
							{@render row(entry)}
						{/each}
					</ul>
				</section>
			{/if}
		</div>
	{/if}

	{#if selectedCount > 0}
		<!-- Sticky selection action bar -->
		<div
			class="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md"
		>
			<div class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
				<span class="text-sm font-medium text-ink"
					>{t('selected_count', { n: String(selectedCount) })}</span
				>
				<div class="flex items-center gap-2">
					<Button
						variant="secondary"
						size="sm"
						onclick={() => restore(selectedIds)}
						disabled={working}
					>
						<RotateCcw class="size-4" />
						{t('restore')}
					</Button>
					<Button
						variant="destructive"
						size="sm"
						onclick={() => askPurge('many', selectedIds)}
						disabled={working}
					>
						<Trash2 class="size-4" />
						{t('delete_forever')}
					</Button>
				</div>
			</div>
		</div>
	{/if}

	<Dialog
		open={confirm != null}
		title={confirmTitle}
		description={t('delete_permanently_warning')}
		onclose={() => (confirm = null)}
	>
		{#if confirm?.kind === 'one' && confirm.label}
			<p class="text-sm text-ink-muted">{t('item_gone_for_good', { label: confirm.label })}</p>
		{:else}
			<p class="text-sm text-ink-muted">{t('items_gone_for_good')}</p>
		{/if}
		{#snippet footer()}
			<Button variant="ghost" onclick={() => (confirm = null)}>{t('cancel')}</Button>
			<Button variant="destructive" onclick={doPurge}>{t('delete_forever')}</Button>
		{/snippet}
	</Dialog>

	<Dialog
		open={pendingRetention != null}
		title={t('trash_retention_confirm_title')}
		description={t('trash_retention_confirm_body', {
			n: String(pendingRetention ? expiringCount(pendingRetention) : 0),
			days: pendingRetention ? String(pendingRetention) : ''
		})}
		onclose={() => (pendingRetention = null)}
	>
		<p class="text-sm text-ink-muted">{t('items_gone_for_good')}</p>
		{#snippet footer()}
			<Button variant="ghost" onclick={() => (pendingRetention = null)}>{t('cancel')}</Button>
			<Button
				variant="destructive"
				onclick={() => pendingRetention != null && saveRetention(pendingRetention)}
			>
				{t('trash_retention_confirm_action')}
			</Button>
		{/snippet}
	</Dialog>
</main>

{#snippet row(entry: Entry)}
	<li class="flex items-center gap-2 px-3 py-2.5">
		<Checkbox
			class="min-w-0 flex-1"
			label={entry.label}
			description={entryDescription(entry)}
			checked={selected[entry.id]}
			onchange={(e) => toggle(entry.id, e.currentTarget.checked)}
		/>
		<Button variant="ghost" size="sm" onclick={() => restore([entry.id])} disabled={working}>
			<RotateCcw class="size-4" />
			{t('restore')}
		</Button>
		<Button
			type="button"
			variant="ghost"
			size="sm"
			class="w-11 shrink-0 px-0 text-ink-muted hover:bg-danger/10 hover:text-danger sm:w-9"
			onclick={() => askPurge('one', [entry.id], entry.label)}
			disabled={working}
			aria-label={`${t('delete')} ${entry.label}`}
		>
			<Trash2 class="size-4" />
		</Button>
	</li>
{/snippet}
