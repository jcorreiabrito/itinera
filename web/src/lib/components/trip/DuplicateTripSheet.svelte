<script lang="ts" module>
	let instanceCount = 0;
</script>

<script lang="ts">
	import { trips } from '$lib/db';
	import type { Trip } from '$lib/db';
	import { untrack } from 'svelte';
	import { Button, Checkbox, Field, Input, Sheet, toast } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import { isDirty, snapshot } from '$lib/utils/form-dirty';

	interface Props {
		open?: boolean;
		source?: Trip | null;
		/** Called with the newly created copy. */
		onsaved: (trip: Trip) => void;
	}

	let { open = $bindable(false), source = null, onsaved }: Props = $props();

	const uid = ++instanceCount;
	const fid = (s: string) => `dup-${s}-${uid}`;

	let title = $state('');
	let newStartDate = $state('');
	let saving = $state(false);
	let wasOpen = false;

	// Defaults mirror docs/06-page-home.md: checklist + itinerary on; bookings,
	// budget targets and expenses off.
	let opts = $state({
		checklist: true,
		itinerary: true,
		flights: false,
		reservations: false,
		budgetTargets: false,
		expenses: false
	});

	/** Everything the form can change, so "edited?" stays one comparison. */
	const fields = () => ({ title, newStartDate, opts });
	/** The same fields as loaded; `null` until the sheet has read the source. */
	let baseline = $state<string | null>(null);
	const dirty = $derived(isDirty(baseline, fields()));

	function initForm() {
		title = `${source?.title ?? 'Trip'} (copy)`;
		newStartDate = source?.startDate ?? '';
		opts = {
			checklist: true,
			itinerary: true,
			flights: false,
			reservations: false,
			budgetTargets: false,
			expenses: false
		};
		// `untrack`: taking the baseline must not make the open/close effect
		// depend on every field, or it would re-run on each keystroke.
		baseline = untrack(() => snapshot(fields()));
	}

	$effect(() => {
		if (open && !wasOpen) initForm();
		wasOpen = open;
	});

	async function save() {
		if (!source) return;
		saving = true;
		try {
			const copy = await trips.duplicate(source._id, {
				title: title.trim() || undefined,
				newStartDate: newStartDate || undefined,
				checklist: opts.checklist,
				itinerary: opts.itinerary,
				flights: opts.flights,
				reservations: opts.reservations,
				budgetTargets: opts.budgetTargets,
				expenses: opts.expenses
			});
			open = false;
			onsaved?.(copy);
		} catch {
			toast.error(t('could_not_duplicate_trip'));
		} finally {
			saving = false;
		}
	}
</script>

<Sheet
	bind:open
	side="right"
	{dirty}
	title={t('duplicate_trip_title')}
	description={source?.title
		? t('duplicate_trip_desc_named', { title: source.title })
		: t('duplicate_trip_desc')}
>
	<div class="flex flex-col gap-4">
		<Field label={t('new_trip_name')} for={fid('title')}>
			<Input id={fid('title')} value={title} oninput={(e) => (title = e.currentTarget.value)} />
		</Field>

		<Field label={t('start_date')} for={fid('start')} hint={t('dates_shift_hint')}>
			<Input
				id={fid('start')}
				type="date"
				value={newStartDate}
				oninput={(e) => (newStartDate = e.currentTarget.value)}
			/>
		</Field>

		<fieldset class="flex flex-col gap-1 rounded-md border border-border p-3">
			<legend class="px-1 text-sm font-medium text-ink">{t('what_to_copy')}</legend>

			<Checkbox
				label={t('checklist')}
				description={t('copied_unchecked')}
				checked={opts.checklist}
				onchange={(e) => (opts.checklist = e.currentTarget.checked)}
			/>

			<Checkbox
				label={t('itinerary')}
				description={t('shifted_to_new_dates')}
				checked={opts.itinerary}
				onchange={(e) => (opts.itinerary = e.currentTarget.checked)}
			/>

			<Checkbox
				label={t('flights')}
				checked={opts.flights}
				onchange={(e) => (opts.flights = e.currentTarget.checked)}
			/>

			<Checkbox
				label={t('reservations')}
				checked={opts.reservations}
				onchange={(e) => (opts.reservations = e.currentTarget.checked)}
			/>

			<Checkbox
				label={t('budget_targets')}
				checked={opts.budgetTargets}
				onchange={(e) => (opts.budgetTargets = e.currentTarget.checked)}
			/>

			<Checkbox
				label={t('expenses')}
				checked={opts.expenses}
				onchange={(e) => (opts.expenses = e.currentTarget.checked)}
			/>
		</fieldset>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)} disabled={saving}>{t('cancel')}</Button>
		<Button onclick={save} disabled={saving || !source}>
			{saving ? t('duplicating') : t('duplicate')}
		</Button>
	{/snippet}
</Sheet>
