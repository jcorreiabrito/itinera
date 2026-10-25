<script lang="ts">
	import { checklist } from '$lib/db';
	import { Button, Checkbox, Dialog, ErrorState, Skeleton, toast } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import {
		generatePackingList,
		groupPackingSuggestions,
		isSuggestionOnChecklist,
		type PackingSuggestion,
		type PackingTitleKey,
		type PackingTrip
	} from '$lib/packing';
	import { loadCachedWeather, type WeatherForecast } from '$lib/utils/weather';

	interface Props {
		open?: boolean;
		/** Bare trip ULID. */
		tripId: string;
		trip: PackingTrip | null;
		/** Called after the batch was written, so the page can reload its views. */
		onadded?: () => void;
	}

	let { open = $bindable(false), tripId, trip, onadded }: Props = $props();

	let loading = $state(false);
	let loadError = $state(false);
	let suggestions = $state<PackingSuggestion[]>([]);
	let checked = $state<Record<string, boolean>>({});
	let adding = $state(false);
	let wasOpen = false;

	const groups = $derived(groupPackingSuggestions(suggestions));
	const selectedCount = $derived(
		suggestions.reduce((count, suggestion) => count + (checked[suggestion.titleKey] ? 1 : 0), 0)
	);
	const selectedLabel = $derived(
		selectedCount === 1
			? t('packing_selected_one')
			: t('packing_selected_many', { n: String(selectedCount) })
	);

	/**
	 * The forecast the app already has on this device, if any.
	 *
	 * Cache only: the generator treats a missing forecast as "no weather hint",
	 * and a dialog must not start a network call on a page that works offline.
	 */
	function cachedForecast(source: PackingTrip | null): WeatherForecast | null {
		for (const destination of source?.destinations ?? []) {
			if (typeof destination.lat === 'number' && typeof destination.lng === 'number') {
				return loadCachedWeather(destination.lat, destination.lng);
			}
		}
		return null;
	}

	async function load() {
		loading = true;
		loadError = false;
		try {
			const existing = await checklist.byTrip(tripId);
			suggestions = generatePackingList({
				trip: trip ?? {},
				existing,
				forecast: cachedForecast(trip)
			});
			const next: Record<string, boolean> = {};
			for (const suggestion of suggestions) {
				next[suggestion.titleKey] = suggestion.checkedByDefault;
			}
			checked = next;
		} catch {
			loadError = true;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open && !wasOpen) load();
		wasOpen = open;
	});

	function toggle(titleKey: PackingTitleKey, value: boolean) {
		checked = { ...checked, [titleKey]: value };
	}

	function setAll(value: boolean) {
		const next: Record<string, boolean> = {};
		for (const suggestion of suggestions) next[suggestion.titleKey] = value;
		checked = next;
	}

	function groupCountLabel(count: number): string {
		return count === 1
			? t('packing_group_count_one')
			: t('packing_group_count_many', { n: String(count) });
	}

	async function addSelected() {
		const chosen = suggestions.filter((suggestion) => checked[suggestion.titleKey]);
		if (chosen.length === 0) return;

		adding = true;
		try {
			/*
			 * Re-read immediately before writing: another device may have added an
			 * item while this preview was open, and the batch must not duplicate it.
			 */
			const existing = await checklist.byTrip(tripId);
			const fresh = chosen.filter((suggestion) => !isSuggestionOnChecklist(suggestion, existing));

			if (fresh.length === 0) {
				open = false;
				toast.success(t('already_up_to_date'));
				return;
			}

			/*
			 * One `bulkDocs` round trip through the repository, so the dialog does
			 * not own the document shape and the batch lands atomically.
			 */
			await checklist.createMany(
				tripId,
				fresh.map((suggestion, index) => ({
					text: t(suggestion.titleKey),
					group: suggestion.groupKey,
					quantity: suggestion.quantity,
					order: index
				}))
			);

			open = false;
			toast.success(
				t(fresh.length === 1 ? 'packing_added_one' : 'packing_added_many', {
					n: String(fresh.length)
				})
			);
			onadded?.();
		} catch {
			toast.error(t('packing_add_failed'));
		} finally {
			adding = false;
		}
	}
</script>

<Dialog bind:open title={t('packing_dialog_title')} description={t('packing_dialog_desc')}>
	{#if loading}
		<div class="space-y-2 py-2" aria-busy="true">
			<p class="sr-only" role="status">{t('packing_loading')}</p>
			<Skeleton class="h-10 w-full rounded-md" />
			<Skeleton class="h-10 w-full rounded-md" />
			<Skeleton class="h-10 w-full rounded-md" />
		</div>
	{:else if loadError}
		<ErrorState title={t('packing_load_failed')} onretry={load} />
	{:else if suggestions.length === 0}
		<div class="py-8 text-center">
			<p class="font-medium text-ink">{t('packing_none_title')}</p>
			<p class="mt-1 text-sm text-ink-muted">{t('packing_none_desc')}</p>
		</div>
	{:else}
		<div class="flex flex-col gap-4">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex flex-wrap gap-1">
					<Button variant="ghost" size="sm" onclick={() => setAll(true)}>
						{t('packing_select_all')}
					</Button>
					<Button variant="ghost" size="sm" onclick={() => setAll(false)}>
						{t('packing_clear_all')}
					</Button>
				</div>
				<p class="text-sm tabular-nums text-ink-muted" aria-live="polite">{selectedLabel}</p>
			</div>

			{#each groups as group (group.groupKey)}
				<section>
					<header class="flex items-baseline justify-between gap-3 border-b border-border pb-1.5">
						<h3 class="text-sm font-semibold text-ink">{group.groupKey}</h3>
						<span class="text-xs tabular-nums text-ink-muted">
							{groupCountLabel(group.suggestions.length)}
						</span>
					</header>
					<ul class="divide-y divide-border/60">
						{#each group.suggestions as suggestion (suggestion.titleKey)}
							<li>
								<Checkbox
									checked={checked[suggestion.titleKey] ?? false}
									label={suggestion.quantity && suggestion.quantity > 1
										? `${t(suggestion.titleKey)} × ${suggestion.quantity}`
										: t(suggestion.titleKey)}
									description={t(suggestion.reasonKey)}
									class="min-h-touch items-center py-1"
									onchange={(event) => toggle(suggestion.titleKey, event.currentTarget.checked)}
								/>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)} disabled={adding}>
			{t('cancel')}
		</Button>
		<Button onclick={addSelected} disabled={adding || loading || loadError || selectedCount === 0}>
			{adding ? t('packing_adding') : `${t('packing_add')} (${selectedCount})`}
		</Button>
	{/snippet}
</Dialog>
