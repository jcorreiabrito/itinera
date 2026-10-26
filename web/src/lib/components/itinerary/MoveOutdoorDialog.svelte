<script lang="ts">
	import { CloudRain, MapPin } from 'lucide-svelte';
	import type { ItineraryItem } from '$lib/db';
	import { Button, Dialog } from '$lib/components/ui';
	import { formatWeekdayDate } from '$lib/format';
	import { t } from '$lib/i18n.svelte';
	import type { DriestTarget } from './weather-plan';

	/*
	 * The preview shown before a wet-day plan is moved. It names every item and
	 * the target day — the two things the traveller needs to judge the suggestion
	 * — and offers no confirm button when no nearby day is drier.
	 */

	interface Props {
		open?: boolean;
		/** The outdoor items that would move. */
		items: readonly ItineraryItem[];
		/** The day they are on now. */
		currentDate: string;
		/** Its precipitation chance, percent. */
		currentChance: number;
		/** The drier day, or null when the window has none. */
		target: DriestTarget | null;
		busy?: boolean;
		onmove: () => void;
	}

	let {
		open = $bindable(false),
		items,
		currentDate,
		currentChance,
		target,
		busy = false,
		onmove
	}: Props = $props();

	const count = $derived(items.length);
	const title = $derived(target ? t('weather_driest_title') : t('weather_driest_none_title'));
	const confirmLabel = $derived(
		t(count === 1 ? 'weather_driest_confirm_one' : 'weather_driest_confirm_many', {
			n: String(count)
		})
	);
</script>

<Dialog bind:open {title}>
	{#if target}
		<p class="text-sm text-ink-muted">
			{t('weather_driest_body', {
				current: String(Math.round(currentChance)),
				target: formatWeekdayDate(target.date),
				targetChance: String(Math.round(target.chance))
			})}
		</p>

		<ul class="mt-3 space-y-1.5">
			{#each items as item (item._id)}
				<li class="flex items-start gap-2 text-sm text-ink">
					<MapPin class="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
					<span class="min-w-0">{item.title?.trim() || t('untitled')}</span>
				</li>
			{/each}
		</ul>

		<p
			class="mt-3 flex items-start gap-2 rounded-md border border-info/30 bg-info/10 px-3 py-2 text-sm text-info"
		>
			<CloudRain class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
			<span>
				{t('weather_driest_target_forecast', {
					date: formatWeekdayDate(target.date),
					p: String(Math.round(target.chance)),
					min: String(target.weather.minTemp),
					max: String(target.weather.maxTemp)
				})}
			</span>
		</p>
	{:else}
		<p class="text-sm text-ink-muted" role="status">
			{t('weather_driest_none_body', { date: formatWeekdayDate(currentDate) })}
		</p>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)} disabled={busy}>
			{target ? t('cancel') : t('close')}
		</Button>
		{#if target}
			<Button onclick={onmove} disabled={busy}>
				{busy ? t('saving') : confirmLabel}
			</Button>
		{/if}
	{/snippet}
</Dialog>
