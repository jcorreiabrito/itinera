<script lang="ts">
	import { Footprints } from 'lucide-svelte';
	import type { ItineraryItem } from '$lib/db';
	import { Button, Dialog } from '$lib/components/ui';
	import type { RoutePlan } from '$lib/route';
	import { t } from '$lib/i18n.svelte';

	/*
	 * The preview for the walking optimiser. It lists the proposed order and the
	 * distance saved; applying writes only the untimed items' `order`, so the
	 * clock (and every booking) is untouched.
	 */

	interface Props {
		open?: boolean;
		/** The same items, already in the proposed order. */
		items: readonly ItineraryItem[];
		plan: RoutePlan;
		busy?: boolean;
		onapply: () => void;
	}

	let { open = $bindable(false), items, plan, busy = false, onapply }: Props = $props();

	// Below this the difference is rounding noise, not a reason to renumber a day.
	const MEANINGFUL_SAVING_KM = 0.05;
	const meaningful = $derived(plan.savedKm >= MEANINGFUL_SAVING_KM);
</script>

<Dialog bind:open title={t('route_optimise_title')} description={t('route_optimise_desc')}>
	<p class="text-sm text-ink-muted">
		{t('route_optimise_current', { km: plan.currentKm.toFixed(1) })}
	</p>

	{#if meaningful}
		<p class="mt-1 text-sm font-medium text-ink">
			{t('route_optimise_result', { km: plan.optimisedKm.toFixed(1) })}
		</p>
		<p class="mt-1 text-sm text-success">
			{t('route_optimise_saving', {
				km: plan.savedKm.toFixed(1),
				minutes: String(Math.max(1, Math.round(plan.savedMinutes)))
			})}
		</p>

		<h3 class="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
			{t('route_optimise_new_order')}
		</h3>
		<ol class="mt-1.5 space-y-1">
			{#each items as item, index (item._id)}
				<li class="flex items-center gap-2.5 rounded-md bg-surface-sunken px-3 py-2 text-sm">
					<span class="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-muted"
						>{index + 1}</span
					>
					<span class="min-w-0 flex-1">{item.title?.trim() || t('untitled')}</span>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="mt-2 text-sm text-ink-muted" role="status">{t('route_optimise_none')}</p>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)} disabled={busy}>
			{t('cancel')}
		</Button>
		{#if meaningful}
			<Button onclick={onapply} disabled={busy}>
				<Footprints class="size-4" aria-hidden="true" />
				{busy ? t('saving') : t('route_optimise_apply')}
			</Button>
		{/if}
	{/snippet}
</Dialog>
