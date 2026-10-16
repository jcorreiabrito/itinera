<script lang="ts">
	import Dialog from './Dialog.svelte';
	import Button from './Button.svelte';
	import { listConflicts, markConflictReviewed } from '$lib/db/sync';
	import type { ConflictReport } from '$lib/db/conflicts';
	import { t } from '$lib/i18n.svelte';
	import { toast } from './toast';

	let { open = $bindable(false) }: { open: boolean } = $props();

	let conflicts = $state<ConflictReport[]>([]);
	let loading = $state(false);

	async function loadConflicts() {
		loading = true;
		try {
			conflicts = await listConflicts();
		} catch (err) {
			console.error('Failed to load conflicts', err);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open) {
			loadConflicts();
		}
	});

	async function handleDismiss(id: string) {
		try {
			await markConflictReviewed(id);
			conflicts = conflicts.filter((c) => c.id !== id);
			toast.success(t('marked_as_reviewed'));
		} catch {
			toast.error(t('could_not_undo'));
		}
	}
</script>

<Dialog bind:open title={t('review_changes')}>
	<div class="space-y-4">
		<p class="text-sm text-ink-muted">{t('conflicts_help_text')}</p>

		{#if loading}
			<div class="py-8 text-center text-sm text-ink-muted">{t('checking_conflicts')}</div>
		{:else if conflicts.length === 0}
			<div
				class="grid place-items-center gap-1 rounded-lg border border-dashed border-border py-8 text-center"
			>
				<p class="text-sm font-medium text-ink">{t('no_conflicts_title')}</p>
				<p class="max-w-sm text-xs text-ink-muted">{t('no_conflicts_desc')}</p>
			</div>
		{:else}
			<div class="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
				{#each conflicts as item (item.id)}
					<div class="space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
						<div class="flex items-center justify-between gap-2 font-medium text-ink">
							<span class="truncate font-mono text-xs text-primary-700">{item.id}</span>
							<span class="shrink-0 text-xs text-ink-muted">
								{t('items_count_plural', { n: String(item.losers.length) })}
							</span>
						</div>

						<div class="space-y-1 rounded bg-surface-sunken p-2 text-xs">
							<div class="font-semibold text-ink">{t('most_recently')}</div>
							<pre class="overflow-x-auto font-mono text-[11px] text-ink-muted">{JSON.stringify(
									item.winner,
									null,
									2
								)}</pre>
						</div>

						<div class="flex justify-end">
							<Button size="sm" variant="ghost" onclick={() => handleDismiss(item.id)}>
								{t('mark_reviewed')}
							</Button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</Dialog>
