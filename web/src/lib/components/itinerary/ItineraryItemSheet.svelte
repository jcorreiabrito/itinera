<script lang="ts">
	import type { Flight, ItineraryItem, Reservation } from '$lib/db';
	import { Button, Sheet } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import ItineraryItemForm from './ItineraryItemForm.svelte';
	import type { DayOption } from './day-options';

	interface Props {
		open?: boolean;
		mode?: 'create' | 'edit';
		/** Bare trip ULID. */
		tripId: string;
		item?: ItineraryItem | null;
		/** Default day key for a new item ('null' = Unscheduled). */
		defaultDayKey?: string | null;
		/** The trip's days, dated or numbered, for the day picker. */
		days: DayOption[];
		flights?: Flight[];
		reservations?: Reservation[];
		/** Home currency, used for the optional estimated cost. */
		homeCurrency?: string;
		onsaved?: () => void;
	}

	let {
		open = $bindable(false),
		mode = 'create',
		tripId,
		item = null,
		defaultDayKey = null,
		days,
		flights = [],
		reservations = [],
		homeCurrency = 'EUR',
		onsaved
	}: Props = $props();

	let formDirty = $state(false);
	let formSaving = $state(false);
	let formRef = $state<{ save: () => Promise<void> } | null>(null);
</script>

<Sheet
	bind:open
	side="right"
	dirty={formDirty}
	title={mode === 'create' ? t('add_activity') : t('edit_activity')}
	description={mode === 'create' ? t('itinerary_sheet_desc') : undefined}
>
	<ItineraryItemForm
		bind:this={formRef}
		active={open}
		{mode}
		{tripId}
		{item}
		{defaultDayKey}
		{days}
		{flights}
		{reservations}
		{homeCurrency}
		bind:dirty={formDirty}
		bind:saving={formSaving}
		{onsaved}
		ondone={() => (open = false)}
	/>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)} disabled={formSaving}
			>{t('cancel')}</Button
		>
		<Button onclick={() => formRef?.save()} disabled={formSaving}>
			{formSaving ? t('saving') : mode === 'create' ? t('add_activity') : t('save_changes')}
		</Button>
	{/snippet}
</Sheet>
