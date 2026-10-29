<script lang="ts" module>
	let instanceCount = 0;
</script>

<script lang="ts">
	import { bareTripUlid, checklist, trips } from '$lib/db';
	import type { ChecklistTemplate, Destination, Trip } from '$lib/db';
	import { ClipboardList, Copy, PenLine, Upload } from 'lucide-svelte';
	import { untrack } from 'svelte';
	import { Button, Field, Input, Select, Sheet, toast } from '$lib/components/ui';
	import { flagEnabled } from '$lib/config';
	import { t } from '$lib/i18n.svelte';
	import { importTripToLocalDb } from '$lib/db/importer';
	import { importDreamTemplateToLocalDb, isDreamTemplatePayload } from '$lib/db/dream-template';
	import {
		DREAM_TEMPLATE_SAMPLE_FILENAME,
		buildDreamTemplateSample,
		downloadJsonTemplate
	} from '$lib/db/template-samples';
	import { isDirty, snapshot } from '$lib/utils/form-dirty';
	import DestinationListEditor from './DestinationListEditor.svelte';

	interface Props {
		open?: boolean;
		/** Default home currency for new trips (from settings). */
		defaultCurrency?: string;
		/** Existing trips offered as duplicate sources. */
		sources?: Trip[];
		/** Called with the created trip after a Blank / template create or import. */
		onsaved: (trip: Trip) => void;
		/** Called when the user chose "Duplicate a trip" and picked a source. */
		onduplicate: (source: Trip) => void;
	}

	let {
		open = $bindable(false),
		defaultCurrency = 'EUR',
		sources = [],
		onsaved,
		onduplicate
	}: Props = $props();

	const uid = ++instanceCount;
	const fid = (s: string) => `new-${s}-${uid}`;

	const CURRENCIES = [
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
	];

	type Step = 'choose' | 'blank' | 'template' | 'duplicate' | 'import';

	let step = $state<Step>('choose');
	let saving = $state(false);
	let importing = $state(false);
	let wasOpen = false;

	let templates = $state<ChecklistTemplate[]>([]);
	let templateId = $state('');
	let sourceId = $state('');
	let importFile = $state<File | null>(null);
	let fileInputRef = $state<HTMLInputElement | null>(null);
	let importTab = $state<'file' | 'paste'>('file');
	let pasteText = $state('');

	/** Deployment switch: hides the dream option without changing stored trips. */
	const dreamEnabled = flagEnabled('dreamTrips');

	interface FormState {
		title: string;
		dateMode: 'dated' | 'dream';
		dreamDayCount: string;
		startDate: string;
		endDate: string;
		destinations: Destination[];
		homeCurrency: string;
		stage: 'planning' | 'confirmed';
		travelerCount: string;
	}

	let form = $state<FormState>(blankForm());
	let errors = $state<Partial<Record<keyof FormState, string>>>({});

	/**
	 * Everything the user can put into the sheet that a swipe would throw away:
	 * the trip form, the template and source-trip picks, and the import inputs.
	 * `step` is deliberately absent — moving between the sheet's steps is
	 * navigation, not an edit, and merely choosing a step must not prompt.
	 */
	const fields = () => ({
		form,
		templateId,
		sourceId,
		// A `File` does not survive JSON, so the name the drop zone shows stands in for it.
		importName: importFile?.name ?? '',
		pasteText
	});
	/** The same fields as loaded; `null` until the sheet has reset its form. */
	let baseline = $state<string | null>(null);
	const dirty = $derived(isDirty(baseline, fields()));

	function blankForm(): FormState {
		return {
			title: '',
			dateMode: 'dated',
			dreamDayCount: '7',
			startDate: '',
			endDate: '',
			destinations: [],
			homeCurrency: defaultCurrency || 'EUR',
			stage: 'planning',
			travelerCount: '1'
		};
	}

	async function loadTemplates() {
		try {
			templates = await checklist.templates.list();
			const def = await checklist.templates.getDefault();
			// The default template lands a tick after `reset()` took its snapshot, so
			// it is picked up as part of what was loaded rather than as an edit — but
			// only while the fields still match the baseline, so a keystroke that beat
			// the fetch keeps its own baseline and stays dirty.
			const beforeDefault = untrack(() => snapshot(fields()));
			templateId = def?._id ?? templates[0]?._id ?? '';
			if (beforeDefault === baseline) baseline = untrack(() => snapshot(fields()));
		} catch {
			templates = [];
		}
	}

	function reset() {
		step = 'choose';
		errors = {};
		form = blankForm();
		sourceId = sources[0]?._id ?? '';
		importFile = null;
		importTab = 'file';
		pasteText = '';
		void loadTemplates();
		// `untrack`: taking the baseline must not make the open/close effect
		// depend on every field, or it would re-run on each keystroke.
		baseline = untrack(() => snapshot(fields()));
	}

	$effect(() => {
		if (open && !wasOpen) reset();
		wasOpen = open;
	});

	const currencyOptions = $derived(
		CURRENCIES.includes(form.homeCurrency) ? CURRENCIES : [form.homeCurrency, ...CURRENCIES]
	);

	const hasTemplates = $derived(templates.length > 0);
	const hasSources = $derived(sources.length > 0);

	function validate(): boolean {
		const e: Partial<Record<keyof FormState, string>> = {};
		if (!form.title.trim()) e.title = t('trip_name_required');
		if (form.dateMode === 'dated') {
			if (!form.startDate) e.startDate = t('start_date_required');
			if (!form.endDate) e.endDate = t('end_date_required');
			if (form.startDate && form.endDate && form.endDate < form.startDate) {
				e.endDate = t('end_before_start_date');
			}
		} else {
			const days = Number(form.dreamDayCount);
			if (!Number.isInteger(days) || days < 1 || days > 366) {
				e.dreamDayCount = t('invalid_day_count');
			}
		}
		if (form.travelerCount.trim()) {
			const n = Number(form.travelerCount);
			if (!Number.isInteger(n) || n < 1) {
				e.travelerCount = t('travelers_min');
			}
		}
		errors = e;
		return Object.keys(e).length === 0;
	}

	async function create() {
		if (!validate()) return;
		saving = true;
		try {
			const cleanDestinations = (form.destinations ?? []).filter(
				(d) => d.name && d.name.trim().length > 0
			);
			const created = await trips.create({
				title: form.title.trim(),
				dateMode: form.dateMode,
				dreamDayCount: form.dateMode === 'dream' ? Number(form.dreamDayCount) : undefined,
				startDate: form.dateMode === 'dated' ? form.startDate : undefined,
				endDate: form.dateMode === 'dated' ? form.endDate : undefined,
				homeCurrency: form.homeCurrency,
				stage: form.stage,
				destinations: cleanDestinations,
				travelerCount: form.travelerCount.trim() ? Number(form.travelerCount) : 1
			});
			const tplId =
				step === 'template' ? templateId : ((await checklist.templates.getDefault())?._id ?? '');
			if (tplId) {
				try {
					await checklist.applyTemplate(bareTripUlid(created._id), tplId, 'merge');
				} catch {
					toast.warning(t('template_apply_failed'));
				}
			}
			open = false;
			onsaved?.(created);
		} catch {
			toast.error(t('could_not_create_trip_kept'));
		} finally {
			saving = false;
		}
	}

	function continueDuplicate() {
		const source = sources.find((t) => t._id === sourceId);
		if (!source) return;
		open = false;
		onduplicate?.(source);
	}

	// Live JSON validation for the paste tab
	const pasteJsonError = $derived.by(() => {
		const text = pasteText.trim();
		if (!text) return null;
		try {
			JSON.parse(text);
			return null;
		} catch (e) {
			return e instanceof Error ? e.message : String(e);
		}
	});

	async function pasteFromClipboard() {
		try {
			const text = await navigator.clipboard.readText();
			pasteText = text;
		} catch {
			// clipboard access denied – user can paste manually
		}
	}

	async function executeImport() {
		importing = true;
		try {
			let payload: unknown;
			if (importTab === 'paste') {
				const text = pasteText.trim();
				if (!text) throw new Error(t('import_invalid_file'));
				payload = JSON.parse(text);
			} else {
				if (!importFile) return;
				const text = await importFile.text();
				payload = JSON.parse(text);
			}

			// Write directly to local PouchDB. PouchDB's live sync automatically replicates to CouchDB
			const res = isDreamTemplatePayload(payload)
				? await importDreamTemplateToLocalDb(payload, { homeCurrency: defaultCurrency })
				: await importTripToLocalDb(payload);

			toast.success(t('import_success'));
			open = false;
			onsaved?.(res.trip);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('import_invalid_file'));
		} finally {
			importing = false;
		}
	}

	function downloadStandardTemplate() {
		const today = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		/* eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain Map/Date is correct here: this is a local accumulator/registry rebuilt on every run, not reactive $state. SvelteMap would add reactivity nobody reads. */
		const start = new Date(today);
		start.setDate(today.getDate() + 30);
		/* eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain Map/Date is correct here: this is a local accumulator/registry rebuilt on every run, not reactive $state. SvelteMap would add reactivity nobody reads. */
		const end = new Date(start);
		end.setDate(start.getDate() + 7);
		const startStr = fmt(start);
		const endStr = fmt(end);
		const dayStr = fmt(new Date(start.getTime() + 86400000));

		const template = {
			schema: 'itinera.trip-export',
			version: 1,
			exportedAt: new Date().toISOString(),
			db: 'itinera',
			tripId: 'trip:TEMPLATE',
			trip: {
				_id: 'trip:TEMPLATE',
				type: 'trip',
				title: 'My Trip to Paris',
				startDate: startStr,
				endDate: endStr,
				stage: 'planning',
				travelerCount: 2,
				homeCurrency: defaultCurrency || 'EUR',
				primaryTimezone: 'Europe/Paris',
				destinations: [
					{
						name: 'Paris',
						country: 'France',
						lat: 48.8566,
						lng: 2.3522,
						arriveDate: startStr,
						departDate: endStr
					}
				],
				budget: {
					total: 2000,
					perDay: 250,
					byCategory: {
						transport: 400,
						lodging: 800,
						food: 400,
						activities: 300,
						other: 100
					}
				},
				tags: ['europe', 'city', 'culture'],
				notes: 'Fill in your trip details here or import from an offline plan.',
				archived: false,
				coverImageAttId: null
			},
			documents: {
				tripDay: [
					{
						_id: `day:TEMPLATE:${dayStr}`,
						type: 'tripDay',
						tripId: 'trip:TEMPLATE',
						date: dayStr,
						title: 'Explore the City & Museums',
						notes: 'Optional notes for this specific day.'
					}
				],
				itineraryItem: [
					{
						_id: 'itin:TEMPLATE:ITEM1',
						type: 'itineraryItem',
						tripId: 'trip:TEMPLATE',
						date: dayStr,
						allDay: false,
						startTime: '10:00',
						endTime: '12:00',
						order: 0,
						title: 'Visit the Eiffel Tower',
						category: 'sightseeing',
						location: {
							name: 'Eiffel Tower',
							address: 'Champ de Mars, 5 Av. Anatole France, 75007 Paris',
							lat: 48.8584,
							lng: 2.2945
						},
						notes: 'Book tickets online in advance to skip lines.',
						estCost: 30,
						currency: 'EUR',
						costs: [
							{
								id: 'cost1',
								label: 'Entry Ticket',
								category: 'activities',
								amount: 30
							}
						],
						linkedFlightId: null,
						linkedReservationId: 'res:TEMPLATE:RES1'
					}
				],
				flight: [
					{
						_id: 'flt:TEMPLATE:FLT1',
						type: 'flight',
						tripId: 'trip:TEMPLATE',
						bookingRef: 'ABC123',
						checkInUrl: 'https://airline.com/checkin',
						order: 0,
						costType: 'total',
						cost: 180,
						currency: 'EUR',
						segments: [
							{
								airline: 'Air France',
								flightNumber: 'AF1234',
								from: {
									code: 'LIS',
									name: 'Humberto Delgado Airport',
									city: 'Lisbon',
									tz: 'Europe/Lisbon'
								},
								to: {
									code: 'CDG',
									name: 'Charles de Gaulle Airport',
									city: 'Paris',
									tz: 'Europe/Paris'
								},
								departLocal: `${startStr}T08:00:00`,
								arriveLocal: `${startStr}T11:00:00`,
								seat: '14A',
								terminal: '2E',
								gate: 'D12',
								baggage: '1 checked bag (23kg), 1 carry-on',
								checkInOpensAt: `${startStr}T08:00:00`,
								notes: 'Arrive 2 hours prior to departure.'
							}
						],
						attachmentIds: []
					}
				],
				reservation: [
					{
						_id: 'res:TEMPLATE:RES1',
						type: 'reservation',
						tripId: 'trip:TEMPLATE',
						kind: 'lodging',
						name: 'Hotel de la Paix',
						location: {
							name: 'Hotel de la Paix',
							address: '19 Rue de la Paix, 75002 Paris',
							lat: 48.8699,
							lng: 2.3318
						},
						start: `${startStr}T14:00:00`,
						end: `${endStr}T12:00:00`,
						confirmation: 'CONF-XYZ-789',
						order: 0,
						costType: 'total',
						cost: 700,
						currency: 'EUR',
						contact: {
							phone: '+33 1 23 45 67 89',
							email: 'reception@hotel.com',
							url: 'https://hotel.com'
						},
						details: {
							roomType: 'Double Standard Room',
							nights: 7
						},
						notes: 'Non-smoking room on a high floor.',
						attachmentIds: []
					}
				],
				expense: [
					{
						_id: 'exp:TEMPLATE:EXP1',
						type: 'expense',
						tripId: 'trip:TEMPLATE',
						date: dayStr,
						category: 'food',
						description: 'Lunch at a traditional bistro',
						amountEstimate: 25,
						amountActual: null,
						currency: 'EUR',
						fxRate: 1.0,
						costType: 'total',
						paid: false,
						linkedType: 'itineraryItem',
						linkedId: 'itin:TEMPLATE:ITEM1'
					}
				],
				checklistItem: [
					{
						_id: 'chk:TEMPLATE:CHK1',
						type: 'checklistItem',
						tripId: 'trip:TEMPLATE',
						text: 'Pack passport & ID cards',
						group: 'Documents',
						order: 0,
						quantity: 1,
						note: 'Check validity before flying',
						dueDate: startStr,
						done: false,
						important: true
					},
					{
						_id: 'chk:TEMPLATE:CHK2',
						type: 'checklistItem',
						tripId: 'trip:TEMPLATE',
						text: 'Buy travel insurance',
						group: 'Documents',
						order: 1,
						quantity: 1,
						done: false,
						important: false
					}
				],
				attachment: []
			},
			counts: {
				tripDay: 1,
				itineraryItem: 1,
				flight: 1,
				reservation: 1,
				expense: 1,
				checklistItem: 2,
				attachment: 0
			},
			attachments: []
		};

		const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'itinera-template.json';
		a.rel = 'noopener';
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	function downloadDreamTemplate() {
		downloadJsonTemplate(
			buildDreamTemplateSample({ defaultCurrency }),
			DREAM_TEMPLATE_SAMPLE_FILENAME
		);
	}

	const choices = $derived([
		{
			id: 'blank',
			icon: PenLine,
			label: t('blank_trip'),
			desc: t('start_fresh_desc')
		},
		{
			id: 'duplicate',
			icon: Copy,
			label: t('duplicate_trip'),
			desc: hasSources ? t('copy_existing_desc') : t('no_trips_to_copy'),
			disabled: !hasSources
		},
		{
			id: 'template',
			icon: ClipboardList,
			label: t('from_template'),
			desc: hasTemplates ? t('prefill_from_template_desc') : t('no_templates_saved'),
			disabled: !hasTemplates
		},
		{
			id: 'import',
			icon: Upload,
			label: t('import_from_json'),
			desc: t('import_trip_desc')
		}
	]);

	const sheetTitle = $derived(
		step === 'choose'
			? t('new_trip')
			: step === 'duplicate'
				? t('duplicate_trip')
				: step === 'template'
					? t('from_template')
					: step === 'import'
						? t('import_from_json')
						: t('new_trip')
	);
</script>

<Sheet
	bind:open
	side="right"
	{dirty}
	title={sheetTitle}
	description={step === 'choose' ? t('how_to_start') : t('trip_form_desc')}
>
	{#if step === 'choose'}
		<div class="flex flex-col gap-3">
			{#each choices as choice (choice.id)}
				{@const Icon = choice.icon}
				<button
					type="button"
					disabled={choice.disabled}
					onclick={() => (step = choice.id as Step)}
					class="flex items-start gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary-600 hover:bg-primary-100/40 disabled:opacity-50 disabled:grayscale-[50%]"
				>
					<span
						class="grid size-9 shrink-0 place-items-center rounded-md bg-primary-100 text-primary-700"
					>
						<Icon />
					</span>
					<span class="min-w-0">
						<span class="block font-medium text-ink">{choice.label}</span>
						<span class="block text-sm text-ink-muted">{choice.desc}</span>
					</span>
				</button>
			{/each}
		</div>
	{:else if step === 'duplicate'}
		<div class="flex flex-col gap-4">
			<Field label={t('trip_to_copy')} for={fid('source')}>
				<Select
					id={fid('source')}
					value={sourceId}
					onchange={(e) => (sourceId = e.currentTarget.value)}
				>
					{#each sources as opt (opt._id)}
						<option value={opt._id}>{opt.title ?? t('untitled')}</option>
					{/each}
				</Select>
			</Field>
			<p class="text-sm text-ink-muted">{t('duplicate_next_step')}</p>
		</div>
	{:else if step === 'import'}
		<div class="flex flex-col gap-4">
			<input
				type="file"
				accept=".json,application/json"
				class="hidden"
				bind:this={fileInputRef}
				onchange={(e) => {
					const file = e.currentTarget.files?.[0];
					if (file) importFile = file;
				}}
			/>

			<!-- Tab toggle -->
			<div class="flex gap-1 rounded-lg bg-surface-sunken p-1">
				<button
					type="button"
					onclick={() => (importTab = 'file')}
					class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {importTab ===
					'file'
						? 'bg-surface text-ink shadow-sm'
						: 'text-ink-muted hover:text-ink'}"
				>
					{t('import_tab_file')}
				</button>
				<button
					type="button"
					onclick={() => (importTab = 'paste')}
					class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {importTab ===
					'paste'
						? 'bg-surface text-ink shadow-sm'
						: 'text-ink-muted hover:text-ink'}"
				>
					{t('import_tab_paste')}
				</button>
			</div>

			{#if importTab === 'file'}
				<!-- Drag-drop / click zone -->
				<button
					type="button"
					onclick={() => fileInputRef?.click()}
					ondragover={(e) => e.preventDefault()}
					ondrop={(e) => {
						e.preventDefault();
						const file = e.dataTransfer?.files?.[0];
						if (file) importFile = file;
					}}
					class="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface p-8 text-center transition-colors hover:border-primary-600 hover:bg-primary-100/30"
				>
					<Upload class="size-8 text-primary-600" />
					<span class="text-sm font-medium text-ink">
						{importFile ? importFile.name : t('import_drop_hint')}
					</span>
					{#if importFile}
						<span class="text-xs text-ink-muted">
							{(importFile.size / 1024).toFixed(1)} KB
						</span>
					{/if}
				</button>
			{:else}
				<!-- Paste textarea -->
				<div class="relative flex flex-col gap-2">
					<div class="flex items-center justify-between">
						{#if pasteText.trim()}
							<span
								class="text-xs font-medium {pasteJsonError ? 'text-destructive' : 'text-success'}"
							>
								{pasteJsonError ? t('import_json_invalid') : t('import_json_valid')}
							</span>
						{:else}
							<span></span>
						{/if}
						<button
							type="button"
							onclick={pasteFromClipboard}
							class="text-xs font-medium text-primary-600 underline-offset-2 hover:underline"
						>
							{t('import_paste_from_clipboard')}
						</button>
					</div>
					<textarea
						id={fid('paste')}
						value={pasteText}
						oninput={(e) => (pasteText = e.currentTarget.value)}
						placeholder={t('import_paste_placeholder')}
						rows="10"
						spellcheck="false"
						autocomplete="off"
						class="w-full resize-none rounded-md border border-border bg-surface p-3 font-mono text-xs text-ink transition-[box-shadow] placeholder:text-ink-muted focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30 {pasteText.trim() &&
						pasteJsonError
							? 'border-destructive ring-1 ring-destructive/30'
							: ''}"></textarea>
				</div>
			{/if}

			<div class="flex flex-col items-center gap-2 text-xs text-ink-muted">
				<span>{t('import_no_json_yet')}</span>
				<div class="inline-flex overflow-hidden rounded-md border border-border bg-surface">
					<button
						type="button"
						onclick={downloadStandardTemplate}
						class="px-3 py-1.5 font-medium text-primary-600 transition-colors hover:bg-primary-100/50"
					>
						{t('template_standard')}
					</button>
					<button
						type="button"
						onclick={downloadDreamTemplate}
						class="border-l border-border px-3 py-1.5 font-medium text-primary-600 transition-colors hover:bg-primary-100/50"
					>
						{t('template_dream')}
					</button>
				</div>
			</div>
		</div>
	{:else}
		<form
			class="flex flex-col gap-4"
			onsubmit={(e) => {
				e.preventDefault();
				create();
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

			{#if dreamEnabled}
				<fieldset class="flex flex-col gap-1.5">
					<legend class="text-sm font-medium text-ink">{t('dates')}</legend>
					<div class="grid grid-cols-2 gap-1 rounded-lg bg-surface-sunken p-1">
						<button
							type="button"
							aria-pressed={form.dateMode === 'dated'}
							onclick={() => (form.dateMode = 'dated')}
							class="rounded-md px-3 py-2 text-sm font-medium transition-colors {form.dateMode ===
							'dated'
								? 'bg-surface text-primary-700 shadow-soft'
								: 'text-ink-muted hover:text-ink'}"
						>
							{t('dates_known')}
						</button>
						<button
							type="button"
							aria-pressed={form.dateMode === 'dream'}
							onclick={() => (form.dateMode = 'dream')}
							class="rounded-md px-3 py-2 text-sm font-medium transition-colors {form.dateMode ===
							'dream'
								? 'bg-surface text-primary-700 shadow-soft'
								: 'text-ink-muted hover:text-ink'}"
						>
							{t('dream_option')}
						</button>
					</div>
					<p class="text-xs text-ink-muted">{t('dream_option_desc')}</p>
				</fieldset>
			{/if}

			{#if form.dateMode === 'dated'}
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
			{:else}
				<Field
					label={t('dream_day_count')}
					for={fid('days')}
					error={errors.dreamDayCount}
					hint={t('dream_day_count_hint')}
				>
					<Input
						id={fid('days')}
						type="number"
						inputmode="numeric"
						min={1}
						max={366}
						value={form.dreamDayCount}
						invalid={!!errors.dreamDayCount}
						oninput={(e) => (form.dreamDayCount = e.currentTarget.value)}
					/>
				</Field>
			{/if}

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

			{#if step === 'template'}
				<Field label={t('checklist_templates')} for={fid('tpl')} hint={t('template_items_hint')}>
					<Select
						id={fid('tpl')}
						value={templateId}
						onchange={(e) => (templateId = e.currentTarget.value)}
					>
						{#each templates as opt (opt._id)}
							<option value={opt._id}>{opt.name ?? t('untitled')} ({opt.items?.length ?? 0})</option
							>
						{/each}
					</Select>
				</Field>
			{/if}

			<button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
		</form>
	{/if}

	{#snippet footer()}
		{#if step === 'choose'}
			<Button variant="ghost" onclick={() => (open = false)}>{t('cancel')}</Button>
		{:else if step === 'duplicate'}
			<Button variant="ghost" onclick={() => (step = 'choose')}>{t('back')}</Button>
			<Button onclick={continueDuplicate} disabled={!sourceId}>{t('continue')}</Button>
		{:else if step === 'import'}
			<Button variant="ghost" onclick={() => (step = 'choose')} disabled={importing}
				>{t('back')}</Button
			>
			<Button
				onclick={executeImport}
				disabled={(importTab === 'file' ? !importFile : !pasteText.trim() || !!pasteJsonError) ||
					importing}
			>
				{importing ? t('importing') : t('import_trip')}
			</Button>
		{:else}
			<Button variant="ghost" onclick={() => (step = 'choose')} disabled={saving}
				>{t('back')}</Button
			>
			<Button onclick={create} disabled={saving}>
				{saving ? t('saving') : t('create_trip')}
			</Button>
		{/if}
	{/snippet}
</Sheet>
