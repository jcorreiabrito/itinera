<script lang="ts" module>
	let instanceCount = 0;
</script>

<script lang="ts">
	import { t } from '$lib/i18n.svelte';
	import { bareTripUid, trips } from '$lib/db';
	import type { Destination, Trip } from '$lib/db';
	import { untrack } from 'svelte';
	import { Button, Field, Input, Select, Sheet, Textarea, toast } from '$lib/components/ui';
	import { isDirty, snapshot } from '$lib/utils/form-dirty';
	import CoverImageField from './CoverImageField.svelte';

	interface Props {
		open?: boolean;
		mode?: 'create' | 'edit';
		trip?: Trip | null;
		/** Default home currency for new trips (from settings). */
		defaultCurrency?: string;
		/** Called with the saved trip after create/edit. */
		onsaved?: (trip: Trip) => void;
		/** Called when the cover changes (so the parent can refresh live). */
		onlivechange?: () => void;
	}

	let {
		open = $bindable(false),
		mode = 'create',
		trip = null,
		defaultCurrency = 'EUR',
		onsaved,
		onlivechange
	}: Props = $props();

	const uid = ++instanceCount;
	const fid = (s: string) => `trip-${s}-${uid}`;

	const CURRENCIES = [
		'Ad hoc',
		'EUR',
		'USD',
		'GBP',
		'JPY',
		'CHF',
		'CAD',
		'AUD',
		'SEK',
		'NOK',
		'DKK',
		'PLN',
		'CZK',
		'HUF',
		'MXN',
		'BRL',
		'CLP',
		'THB',
		'SGD',
		'INR',
		'AED',
		'ZAR'
	].filter((c) => c !== 'Ad hoc');

	import DestinationListEditor from './DestinationListEditor.svelte';

	interface FormState {
		title: string;
		startDate: string;
		endDate: string;
		destinations: Destination[];
		homeCurrency: string;
		budgetTotal: string;
		stage: 'planning' | 'confirmed';
		notes: string;
		tags: string;
		travelerCount: string;
	}

	let form = $state<FormState>(blankForm());
	let errors = $state<Partial<Record<keyof FormState, string>>>({});
	let saving = $state(false);
	let wasOpen = false;

	/**
	 * Everything the form can change, so "edited?" stays one comparison.
	 * `destinations` is in here because DestinationListEditor binds it back.
	 */
	const fields = () => ({
		title: form.title,
		startDate: form.startDate,
		endDate: form.endDate,
		destinations: form.destinations,
		homeCurrency: form.homeCurrency,
		budgetTotal: form.budgetTotal,
		stage: form.stage,
		notes: form.notes,
		tags: form.tags,
		travelerCount: form.travelerCount
	});
	/** The same fields as loaded; `null` until the sheet has read the trip. */
	let baseline = $state<string | null>(null);
	const dirty = $derived(isDirty(baseline, fields()));

	function blankForm(): FormState {
		return {
			title: '',
			startDate: '',
			endDate: '',
			destinations: [],
			homeCurrency: defaultCurrency || 'EUR',
			stage: 'confirmed',
			budgetTotal: '',
			notes: '',
			tags: '',
			travelerCount: '1'
		};
	}

	function initForm() {
		errors = {};
		if (mode === 'edit' && trip) {
			form = {
				title: trip.title ?? '',
				startDate: trip.startDate ?? '',
				endDate: trip.endDate ?? '',
				destinations: trip.destinations ? JSON.parse(JSON.stringify(trip.destinations)) : [],
				homeCurrency: trip.homeCurrency ?? defaultCurrency ?? 'EUR',
				stage: trip.stage ?? 'confirmed',
				budgetTotal: trip.budget?.total != null ? String(trip.budget.total) : '',
				notes: trip.notes ?? '',
				tags: (trip.tags ?? []).join(', '),
				travelerCount: trip.travelerCount != null ? String(trip.travelerCount) : '1'
			};
		} else {
			form = blankForm();
		}
		// `untrack`: taking the baseline must not make the open/close effect
		// depend on every field, or it would re-run on each keystroke.
		baseline = untrack(() => snapshot(fields()));
	}

	// Initialise the form only when the sheet opens (not on every keystroke).
	$effect(() => {
		if (open && !wasOpen) initForm();
		wasOpen = open;
	});

	const currencyOptions = $derived(
		CURRENCIES.includes(form.homeCurrency) ? CURRENCIES : [form.homeCurrency, ...CURRENCIES]
	);

	function parseList(value: string): string[] {
		return value
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}

	function validate(): boolean {
		const e: Partial<Record<keyof FormState, string>> = {};
		if (!form.title.trim()) e.title = t('trip_name_required');
		if (!form.startDate) e.startDate = t('start_date_required');
		if (!form.endDate) e.endDate = t('end_date_required');
		if (form.startDate && form.endDate && form.endDate < form.startDate)
			e.endDate = t('end_before_start_date');
		if (form.travelerCount.trim()) {
			const n = Number(form.travelerCount);
			if (!Number.isInteger(n) || n < 1) {
				e.travelerCount = t('travelers_min');
			}
		}
		if (mode === 'edit' && form.budgetTotal.trim()) {
			const n = Number(form.budgetTotal);
			if (!Number.isFinite(n) || n < 0) e.budgetTotal = t('enter_valid_amount');
		}
		errors = e;
		return Object.keys(e).length === 0;
	}

	async function save() {
		if (!validate()) return;
		saving = true;
		try {
			const cleanDestinations = (form.destinations ?? []).filter(
				(d) => d.name && d.name.trim().length > 0
			);
			if (mode === 'create') {
				const created = await trips.create({
					title: form.title.trim(),
					startDate: form.startDate,
					endDate: form.endDate,
					homeCurrency: form.homeCurrency,
					stage: form.stage,
					destinations: cleanDestinations,
					travelerCount: form.travelerCount.trim() ? Number(form.travelerCount) : 1
				});
				open = false;
				onsaved?.(created);
			} else if (trip) {
				const budgetTotalNum = form.budgetTotal.trim() ? Number(form.budgetTotal) : undefined;
				const hasBudget = trip.budget != null || budgetTotalNum != null;
				const patch: trips.TripPatch = {
					title: form.title.trim(),
					startDate: form.startDate,
					endDate: form.endDate,
					homeCurrency: form.homeCurrency,
					stage: form.stage,
					destinations: cleanDestinations,
					notes: form.notes.trim() ? form.notes : undefined,
					tags: parseList(form.tags),
					budget: hasBudget ? { ...(trip.budget ?? {}), total: budgetTotalNum } : undefined,
					travelerCount: form.travelerCount.trim() ? Number(form.travelerCount) : 1
				};
				const updated = await trips.update(bareTripUid(trip._id), patch);
				open = false;
				onsaved?.(updated);
			}
		} catch {
			toast.error(t('could_not_save_trip_kept'));
		} finally {
			saving = false;
		}
	}
</script>

<Sheet
	bind:open
	side="right"
	{dirty}
	title={mode === 'create' ? t('new_trip') : t('edit_trip')}
	description={mode === 'create' ? t('trip_form_desc') : undefined}
>
	<form
		class="flex flex-col gap-4"
		onsubmit={(e) => {
			e.preventDefault();
			save();
		}}
	>
		<Field label={t('trip_name')} for={fid('title')} required error={errors.title}>
			<Input
				id={fid('title')}
				value={form.title}
				placeholder={t('trip_name_placeholder')}
				invalid={!!errors.title}
				oninput={(e) => (form.title = e.currentTarget.value)}
			/>
		</Field>

		<div class="grid grid-cols-2 gap-3">
			<Field label={t('start')} for={fid('start')} required error={errors.startDate}>
				<Input
					id={fid('start')}
					type="date"
					value={form.startDate}
					invalid={!!errors.startDate}
					oninput={(e) => (form.startDate = e.currentTarget.value)}
				/>
			</Field>
			<Field label={t('end')} for={fid('end')} required error={errors.endDate}>
				<Input
					id={fid('end')}
					type="date"
					value={form.endDate}
					invalid={!!errors.endDate}
					oninput={(e) => (form.endDate = e.currentTarget.value)}
				/>
			</Field>
		</div>

		<DestinationListEditor
			bind:destinations={form.destinations}
			tripStartDate={form.startDate}
			tripEndDate={form.endDate}
		/>

		<Field label={t('home_currency')} for={fid('cur')}>
			<Select
				id={fid('cur')}
				value={form.homeCurrency}
				onchange={(e) => (form.homeCurrency = e.currentTarget.value)}
			>
				{#each currencyOptions as code (code)}
					<option value={code}>{code}</option>
				{/each}
			</Select>
		</Field>

		<Field label={t('stage')} for={fid('stage')} hint={t('stage_hint')}>
			<Select
				id={fid('stage')}
				value={form.stage}
				onchange={(e) => (form.stage = e.currentTarget.value as 'planning' | 'confirmed')}
			>
				<option value="planning">{t('planning')}</option>
				<option value="confirmed">{t('confirmed')}</option>
			</Select>
		</Field>

		<Field
			label={t('travelers')}
			for={fid('travelers')}
			error={errors.travelerCount}
			hint={t('travelers_hint')}
		>
			<Input
				id={fid('travelers')}
				type="number"
				inputmode="numeric"
				min={1}
				value={form.travelerCount}
				placeholder="1"
				invalid={!!errors.travelerCount}
				oninput={(e) => (form.travelerCount = e.currentTarget.value)}
			/>
		</Field>

		{#if mode === 'edit' && trip}
			<Field label={t('cover_photo')}>
				<CoverImageField
					tripId={bareTripUid(trip._id)}
					attId={trip.coverImageAttId ?? null}
					title={form.title || trip.title || ''}
					onchange={() => onlivechange?.()}
				/>
			</Field>
		{/if}

		<Field
			label={t('budget_total')}
			for={fid('budget')}
			error={errors.budgetTotal}
			hint={t('budget_total_hint', { currency: form.homeCurrency })}
		>
			<Input
				id={fid('budget')}
				type="number"
				inputmode="decimal"
				min={0}
				value={form.budgetTotal}
				placeholder="2000"
				invalid={!!errors.budgetTotal}
				oninput={(e) => (form.budgetTotal = e.currentTarget.value)}
			/>
		</Field>

		<Field label={t('tags')} for={fid('tags')} hint={t('comma_separated')}>
			<Input
				id={fid('tags')}
				value={form.tags}
				placeholder={t('trip_tags_placeholder')}
				oninput={(e) => (form.tags = e.currentTarget.value)}
			/>
		</Field>

		<Field label={t('notes')} for={fid('notes')} hint={t('markdown_supported')}>
			<Textarea
				id={fid('notes')}
				rows={5}
				value={form.notes}
				placeholder={t('notes_placeholder')}
				oninput={(e) => (form.notes = e.currentTarget.value)}
			/>
		</Field>

		<!-- Hidden submit keeps Enter-to-save working inside the dialog. -->
		<button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
	</form>

	{#snippet footer()}
		<Button
			variant="ghost"
			onclick={() => {
				open = false;
			}}
			disabled={saving}>{t('cancel')}</Button
		>
		<Button onclick={save} disabled={saving}>
			{saving ? t('saving') : mode === 'create' ? t('create_trip') : t('save_changes')}
		</Button>
	{/snippet}
</Sheet>
