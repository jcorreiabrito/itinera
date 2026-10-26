<script lang="ts" module>
	let instanceCount = 0;

	/** One row of the Nominatim `/search` response, narrowed to what we read. */
	interface NominatimResult {
		lat: string;
		lon: string;
		name?: string;
		display_name?: string;
		address?: {
			road?: string;
			suburb?: string;
			city?: string;
			town?: string;
			municipality?: string;
			country?: string;
		};
	}

	/** The subset of a Nominatim row this form keeps for the results list. */
	interface GeocodeResult {
		name: string;
		address: string;
		lat: number;
		lng: number;
	}
</script>

<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { itinerary } from '$lib/db';
	import type { Flight, ItineraryItem, Reservation, ExpenseCategory } from '$lib/db';
	import { Button, Field, Input, Select, Textarea, toast } from '$lib/components/ui';
	import { Trash2, Wallet, Plus, Search, MapPin, Loader2 } from 'lucide-svelte';
	import { DateTime } from 'luxon';
	import { t } from '$lib/i18n.svelte';
	import { isDirty, snapshot } from '$lib/utils/form-dirty';
	import { CATEGORY_ORDER, CATEGORY_META } from './categories';
	import {
		CATEGORY_ORDER as EXPENSE_CATEGORY_ORDER,
		CATEGORY_META as EXPENSE_CATEGORY_META
	} from '../costs/labels';

	/*
	 * The body of the itinerary item editor, shared by the sheet (phones and
	 * tablets) and the docked inspector (the wide planning workspace).
	 *
	 * The container owns the chrome and the footer: it calls `save()` through a
	 * component binding and passes `dirty`/`saving` back so its own buttons and
	 * discard prompt stay in step. Everything that belongs to the record itself —
	 * fields, validation, the location lookup, cost lines, delete — lives here so
	 * there is one form rather than two that can drift apart.
	 */

	interface Props {
		mode?: 'create' | 'edit';
		/** Bare trip ULID. */
		tripId: string;
		item?: ItineraryItem | null;
		/** Default day for a new item (`null` = Unscheduled). */
		defaultDate?: string | null;
		/** Trip days (ISO) for the day picker. */
		dates: string[];
		flights?: Flight[];
		reservations?: Reservation[];
		/** Home currency, used for the optional estimated cost. */
		homeCurrency?: string;
		/** Whether the form is on screen; turning it on (re)loads the record. */
		active?: boolean;
		/** Two-way: the fields differ from the record as loaded. */
		dirty?: boolean;
		/** Two-way: a save, delete or add-as-expense is in flight. */
		saving?: boolean;
		onsaved?: () => void;
		/** The container should close (a successful save or delete). */
		ondone?: () => void;
	}

	let {
		mode = 'create',
		tripId,
		item = null,
		defaultDate = null,
		dates,
		flights = [],
		reservations = [],
		homeCurrency = 'EUR',
		active = true,
		dirty = $bindable(false),
		saving = $bindable(false),
		onsaved,
		ondone
	}: Props = $props();

	const uid = ++instanceCount;
	const fid = (s: string) => `itin-${s}-${uid}`;

	interface FormState {
		title: string;
		date: string; // '' = Unscheduled
		allDay: boolean;
		startTime: string;
		endTime: string;
		category: string;
		locName: string;
		locAddress: string;
		lat: string;
		lng: string;
		notes: string;
		linkedFlightId: string;
		linkedReservationId: string;
		estCost: string;
		costs: Array<{
			id: string;
			label: string;
			category: ExpenseCategory;
			amount: string;
		}>;
	}

	let form = $state<FormState>(blankForm());
	let errors = $state<Partial<Record<keyof FormState, string>>>({});

	/**
	 * Everything the form can change, so "edited?" stays one comparison.
	 *
	 * The location search box is outside on purpose: `searchQuery` is a lookup
	 * that is never saved, and choosing a result copies what matters into `form`
	 * (`selectLocation`), so a query typed but not applied loses no edit.
	 */
	const fields = () => form;
	/** The same fields as loaded; `null` until the form has read the item. */
	let baseline = $state<string | null>(null);
	const dirtyNow = $derived(isDirty(baseline, fields()));

	function blankForm(): FormState {
		return {
			title: '',
			date: defaultDate ?? '',
			allDay: false,
			startTime: '',
			endTime: '',
			category: '',
			locName: '',
			locAddress: '',
			lat: '',
			lng: '',
			notes: '',
			linkedFlightId: '',
			linkedReservationId: '',
			estCost: '',
			costs: []
		};
	}

	let searchQuery = $state('');
	let searchResults = $state<GeocodeResult[]>([]);
	let searchingLocation = $state(false);
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	function onSearchLocation(query: string) {
		searchQuery = query;
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		const q = query.trim();
		if (q.length < 2) {
			searchResults = [];
			searchingLocation = false;
			return;
		}

		searchingLocation = true;
		searchDebounceTimer = setTimeout(async () => {
			try {
				const res = await fetch(
					`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=5`,
					{ headers: { 'User-Agent': 'ItineraTravelPlanner/1.0' } }
				);
				if (res.ok) {
					const data = (await res.json()) as NominatimResult[];
					searchResults = (data || []).map((d) => {
						const addr = d.address ?? {};
						const display = d.display_name ?? '';
						const parts = [
							addr.road,
							addr.suburb,
							addr.city || addr.town || addr.municipality,
							addr.country
						].filter(Boolean);
						return {
							name: d.name || display.split(',')[0] || display,
							address: parts.join(', ') || display,
							lat: parseFloat(d.lat),
							lng: parseFloat(d.lon)
						};
					});
				}
			} catch {
				// offline
			} finally {
				searchingLocation = false;
			}
		}, 350);
	}

	onDestroy(() => {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
	});

	function selectLocation(loc: { name: string; address: string; lat: number; lng: number }) {
		form.locName = loc.name;
		form.locAddress = loc.address;
		form.lat = loc.lat.toFixed(6);
		form.lng = loc.lng.toFixed(6);
		if (!form.title.trim()) {
			form.title = loc.name;
		}
		searchResults = [];
		searchQuery = '';
	}

	function timeOf(value: string): string {
		if (!value) return '';
		const m = /^(\d{2}):(\d{2})/.exec(value);
		return m ? `${m[1]}:${m[2]}` : '';
	}

	function initForm() {
		errors = {};
		searchQuery = '';
		searchResults = [];
		if (mode === 'edit' && item) {
			form = {
				title: item.title ?? '',
				date: item.date ?? '',
				allDay: item.allDay ?? false,
				startTime: timeOf(item.startTime ?? ''),
				endTime: timeOf(item.endTime ?? ''),
				category: item.category ?? '',
				locName: item.location?.name ?? '',
				locAddress: item.location?.address ?? '',
				lat: item.location?.lat != null ? String(item.location.lat) : '',
				lng: item.location?.lng != null ? String(item.location.lng) : '',
				notes: item.notes ?? '',
				linkedFlightId: item.linkedFlightId ?? '',
				linkedReservationId: item.linkedReservationId ?? '',
				estCost: item.estCost != null ? String(item.estCost) : '',
				costs: (item.costs ?? []).map((c) => ({
					id: c.id,
					label: c.label ?? '',
					category: c.category as ExpenseCategory,
					amount: c.amount != null ? String(c.amount) : ''
				}))
			};
		} else {
			form = blankForm();
		}
		// `untrack`: taking the baseline must not make the reset effect depend on
		// every field, or it would re-run on each keystroke.
		baseline = untrack(() => snapshot(fields()));
	}

	/**
	 * Identity of what the form should be showing.
	 *
	 * An edit reloads only when a different record is opened: the day behind the
	 * inspector may change while the user edits, and that must not discard the
	 * draft. A create is keyed by its default day as well, because "add activity"
	 * on another day means a form for that day.
	 */
	const selectionToken = $derived(
		mode === 'create' ? `create:${defaultDate ?? ''}` : `edit:${item?._id ?? 'new'}`
	);

	let loadedToken = '';
	let wasActive = false;

	$effect(() => {
		const token = selectionToken;
		if (!active) {
			wasActive = false;
			dirty = false;
			return;
		}
		if (!wasActive || token !== loadedToken) {
			initForm();
			loadedToken = token;
		}
		wasActive = true;
	});

	$effect(() => {
		if (!active) return;
		dirty = dirtyNow;
	});

	function dayLabel(iso: string): string {
		const dt = DateTime.fromISO(iso);
		return dt.isValid ? dt.toFormat('ccc d LLL') : iso;
	}

	function flightLabel(f: Flight): string {
		const segs = f.segments ?? [];
		const from = segs[0]?.from?.code;
		const to = segs[segs.length - 1]?.to?.code;
		const no = segs[0]?.flightNumber;
		const route = `${from ?? '?'} ${to ?? '?'}`;
		return no ? `${route} (${no})` : route;
	}

	const showFlightLink = $derived(flights.length > 0 || !form.linkedFlightId);
	const showReservationLink = $derived(reservations.length > 0 || !form.linkedReservationId);

	const totalCostsSum = $derived(
		form.costs.reduce((sum, cost) => {
			const val = Number(cost.amount);
			return Number.isFinite(val) ? sum + val : sum;
		}, 0)
	);

	const canAddExpense = $derived(
		mode === 'edit' && (form.costs.length > 0 || form.estCost.trim() !== '')
	);

	function addCostLine() {
		form.costs = [
			...form.costs,
			{
				id: Math.random().toString(36).substring(2, 9),
				label: '',
				category: 'activities' as ExpenseCategory,
				amount: ''
			}
		];
	}

	function removeCostLine(index: number) {
		form.costs = form.costs.filter((_, i) => i !== index);
	}

	function validate(): boolean {
		const e: Partial<Record<keyof FormState, string>> = {};
		if (!form.title.trim()) e.title = t('give_activity_name');
		if (!form.allDay && form.startTime && form.endTime && form.endTime < form.startTime) {
			e.endTime = t('end_before_start');
		}
		if (form.costs.length > 0) {
			for (const cost of form.costs) {
				if (!cost.label.trim()) {
					e.estCost = t('enter_cost_descriptions');
					break;
				}
				const n = Number(cost.amount);
				if (!cost.amount.trim() || !Number.isFinite(n) || n < 0) {
					e.estCost = t('enter_cost_amounts');
					break;
				}
			}
		} else if (form.estCost.trim()) {
			const n = Number(form.estCost);
			if (!Number.isFinite(n) || n < 0) e.estCost = t('enter_valid_amount');
		}
		errors = e;
		return Object.keys(e).length === 0;
	}

	function buildInput(): itinerary.NewItineraryItemInput {
		const lat = form.lat.trim() ? Number(form.lat) : undefined;
		const lng = form.lng.trim() ? Number(form.lng) : undefined;
		const hasLocation = form.locName.trim() || form.locAddress.trim() || lat != null || lng != null;

		const hasCosts = form.costs.length > 0;
		const cost = hasCosts ? totalCostsSum : form.estCost.trim() ? Number(form.estCost) : undefined;

		return {
			title: form.title.trim(),
			date: form.date ? form.date : null,
			allDay: form.allDay,
			startTime: form.allDay ? undefined : form.startTime || undefined,
			endTime: form.allDay ? undefined : form.endTime || undefined,
			category: form.category ? (form.category as ItineraryItem['category']) : undefined,
			location: hasLocation
				? {
						name: form.locName.trim() || undefined,
						address: form.locAddress.trim() || undefined,
						lat: Number.isFinite(lat) ? lat : undefined,
						lng: Number.isFinite(lng) ? lng : undefined
					}
				: undefined,
			notes: form.notes.trim() || undefined,
			linkedFlightId: form.linkedFlightId || null,
			linkedReservationId: form.linkedReservationId || null,
			estCost: cost,
			currency: cost != null ? homeCurrency : undefined,
			costs: hasCosts
				? form.costs.map((c) => ({
						id: c.id,
						label: c.label.trim(),
						category: c.category,
						amount: Number(c.amount)
					}))
				: undefined
		};
	}

	async function persist(): Promise<ItineraryItem | null> {
		if (!validate()) return null;
		const input = buildInput();
		if (mode === 'create') return itinerary.create(tripId, input);
		if (item) return itinerary.update(item._id, input);
		return null;
	}

	/** Save the form. Called by the container's footer button and by Enter. */
	export async function save() {
		saving = true;
		try {
			const saved = await persist();
			if (!saved) return;
			ondone?.();
			onsaved?.();
		} catch {
			toast.error(t('could_not_save_activity_kept'));
		} finally {
			saving = false;
		}
	}

	async function addExpense() {
		saving = true;
		try {
			const saved = await persist();
			if (!saved) return;
			const exp = await itinerary.addExpense(saved._id);
			if (exp) toast.success(t('added_to_costs'));
			else toast.error(t('add_estimated_cost_first'));
			ondone?.();
			onsaved?.();
		} catch {
			toast.error(t('could_not_add_expense'));
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!item) return;
		const id = item._id;
		saving = true;
		try {
			await itinerary.softDelete(id);
			ondone?.();
			toast.success(t('activity_removed'), {
				action: {
					label: t('undo'),
					onClick: async () => {
						try {
							await itinerary.restore(id);
							onsaved?.();
						} catch {
							toast.error(t('could_not_undo'));
						}
					}
				}
			});
			onsaved?.();
		} catch {
			toast.error(t('could_not_remove_activity'));
		} finally {
			saving = false;
		}
	}
</script>

<form
	class="flex flex-col gap-4"
	onsubmit={(e) => {
		e.preventDefault();
		save();
	}}
>
	<Field label={t('title')} for={fid('title')} required error={errors.title}>
		<Input
			id={fid('title')}
			value={form.title}
			placeholder={t('activity_name_placeholder')}
			invalid={!!errors.title}
			oninput={(e) => (form.title = e.currentTarget.value)}
		/>
	</Field>

	<Field label={t('label_day')} for={fid('date')} hint={t('day_field_hint')}>
		<Select
			id={fid('date')}
			value={form.date}
			onchange={(e) => (form.date = e.currentTarget.value)}
		>
			<option value="">{t('unscheduled_ideas')}</option>
			{#each dates as date (date)}
				<option value={date}>{dayLabel(date)}</option>
			{/each}
		</Select>
	</Field>

	<label class="flex items-center gap-3 text-sm">
		<input
			type="checkbox"
			checked={form.allDay}
			class="size-5 rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30"
			onchange={(e) => (form.allDay = e.currentTarget.checked)}
		/>
		<span class="font-medium text-ink">{t('all_day')}</span>
	</label>

	{#if !form.allDay}
		<div class="grid grid-cols-2 gap-3">
			<Field label={t('start')} for={fid('start')}>
				<Input
					id={fid('start')}
					type="time"
					value={form.startTime}
					oninput={(e) => (form.startTime = e.currentTarget.value)}
				/>
			</Field>
			<Field label={t('end')} for={fid('end')} error={errors.endTime}>
				<Input
					id={fid('end')}
					type="time"
					value={form.endTime}
					oninput={(e) => (form.endTime = e.currentTarget.value)}
				/>
			</Field>
		</div>
	{/if}

	<Field label={t('category')} for={fid('cat')}>
		<Select
			id={fid('cat')}
			value={form.category}
			onchange={(e) => (form.category = e.currentTarget.value)}
		>
			<option value="">{t('no_category')}</option>
			{#each CATEGORY_ORDER as cat (cat)}
				<option value={cat}>{CATEGORY_META[cat].label}</option>
			{/each}
		</Select>
	</Field>

	<!-- Smart Location Search & Autocomplete -->
	<div class="relative flex flex-col gap-1.5">
		<label
			for={fid('loc-search')}
			class="flex items-center justify-between text-xs font-medium text-ink-muted"
		>
			<span>{t('search_place_label')}</span>
			{#if form.lat && form.lng}
				<span class="inline-flex items-center gap-1 font-mono text-[11px] text-primary-600">
					<MapPin class="size-3" aria-hidden="true" />
					{form.lat}, {form.lng}
				</span>
			{/if}
		</label>
		<div class="relative">
			<Input
				id={fid('loc-search')}
				value={searchQuery}
				placeholder={t('search_place_placeholder')}
				oninput={(e) => onSearchLocation(e.currentTarget.value)}
			/>
			<div class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted/50">
				{#if searchingLocation}
					<Loader2 class="size-4 animate-spin text-primary-600" />
				{:else}
					<Search class="size-4" />
				{/if}
			</div>
		</div>

		{#if searchResults.length > 0}
			<ul
				class="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 divide-y divide-border/50 overflow-y-auto rounded-lg border border-border bg-surface py-1 text-sm shadow-card"
			>
				{#each searchResults as res (`${res.lat},${res.lng}`)}
					<li>
						<button
							type="button"
							class="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-sunken"
							onclick={() => selectLocation(res)}
						>
							<MapPin class="mt-0.5 size-4 shrink-0 text-primary-600" />
							<div class="min-w-0 flex-1">
								<div class="truncate font-medium text-ink">{res.name}</div>
								<div class="truncate text-xs text-ink-muted">{res.address}</div>
							</div>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<Field label={t('destination')} for={fid('locname')} hint={t('location_field_hint')}>
		<Input
			id={fid('locname')}
			value={form.locName}
			placeholder={t('location_placeholder')}
			oninput={(e) => (form.locName = e.currentTarget.value)}
		/>
	</Field>
	<Field label={t('address')} for={fid('locaddr')}>
		<Input
			id={fid('locaddr')}
			value={form.locAddress}
			placeholder={t('address_placeholder')}
			oninput={(e) => (form.locAddress = e.currentTarget.value)}
		/>
	</Field>

	<div class="grid grid-cols-2 gap-3">
		<Field label={t('latitude')} for={fid('lat')}>
			<Input
				id={fid('lat')}
				type="number"
				inputmode="decimal"
				step="any"
				value={form.lat}
				placeholder="41.902"
				oninput={(e) => (form.lat = e.currentTarget.value)}
			/>
		</Field>
		<Field label={t('longitude')} for={fid('lng')}>
			<Input
				id={fid('lng')}
				type="number"
				inputmode="decimal"
				step="any"
				value={form.lng}
				placeholder="12.453"
				oninput={(e) => (form.lng = e.currentTarget.value)}
			/>
		</Field>
	</div>

	{#if showFlightLink}
		<Field label={t('link_a_flight')} for={fid('flight')}>
			<Select
				id={fid('flight')}
				value={form.linkedFlightId}
				onchange={(e) => (form.linkedFlightId = e.currentTarget.value)}
			>
				<option value="">{t('no_flight')}</option>
				{#each flights as f (f._id)}
					<option value={f._id}>{flightLabel(f)}</option>
				{/each}
			</Select>
		</Field>
	{/if}

	{#if showReservationLink}
		<Field label={t('link_a_reservation')} for={fid('res')}>
			<Select
				id={fid('res')}
				value={form.linkedReservationId}
				onchange={(e) => (form.linkedReservationId = e.currentTarget.value)}
			>
				<option value="">{t('no_reservation')}</option>
				{#each reservations as r (r._id)}
					<option value={r._id}>{r.name ?? t('label_reservation')}</option>
				{/each}
			</Select>
		</Field>
	{/if}

	<Field label={t('notes')} for={fid('notes')} hint={t('markdown_supported')}>
		<Textarea
			id={fid('notes')}
			rows={3}
			value={form.notes}
			placeholder={t('notes_placeholder')}
			oninput={(e) => (form.notes = e.currentTarget.value)}
		/>
	</Field>

	<Field
		label={t('estimated_cost')}
		for={fid('cost')}
		error={errors.estCost}
		hint={form.costs.length > 0
			? t('cost_from_lines_hint', { currency: homeCurrency })
			: t('cost_single_hint', { currency: homeCurrency })}
	>
		<Input
			id={fid('cost')}
			type="number"
			inputmode="decimal"
			min={0}
			step="any"
			value={form.costs.length > 0 ? String(totalCostsSum) : form.estCost}
			placeholder="25"
			disabled={form.costs.length > 0}
			invalid={!!errors.estCost}
			oninput={(e) => (form.estCost = e.currentTarget.value)}
		/>
	</Field>

	<div class="border-t border-border pt-4">
		<div class="mb-2 flex items-center justify-between">
			<span class="text-sm font-semibold text-ink">{t('segregated_costs')}</span>
			<Button
				type="button"
				variant="secondary"
				size="sm"
				class="h-7 px-2 text-xs"
				onclick={addCostLine}
			>
				<Plus class="size-3.5" />
				{t('add_line')}
			</Button>
		</div>

		{#if form.costs.length === 0}
			<p class="mb-2 text-xs text-ink-muted">
				{t('no_segregated_costs')}
			</p>
		{:else}
			<div class="mb-3 flex flex-col gap-2">
				{#each form.costs as cost, index (cost.id)}
					<div class="flex items-center gap-2">
						<div class="flex-[2]">
							<Input
								value={cost.label}
								placeholder={t('cost_line_placeholder')}
								oninput={(e) => {
									form.costs[index].label = e.currentTarget.value;
								}}
							/>
						</div>
						<div class="flex-[1.5]">
							<Select
								value={cost.category}
								onchange={(e) => {
									form.costs[index].category = e.currentTarget.value as ExpenseCategory;
								}}
							>
								{#each EXPENSE_CATEGORY_ORDER as cat (cat)}
									<option value={cat}>{EXPENSE_CATEGORY_META[cat].label}</option>
								{/each}
							</Select>
						</div>
						<div class="flex-[1]">
							<Input
								type="number"
								inputmode="decimal"
								min={0}
								step="any"
								value={cost.amount}
								placeholder="0"
								oninput={(e) => {
									form.costs[index].amount = e.currentTarget.value;
								}}
							/>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							class="px-2 text-danger hover:bg-danger/10"
							onclick={() => removeCostLine(index)}
							aria-label={t('delete')}
						>
							<Trash2 class="size-4" />
						</Button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#if canAddExpense}
		<Button
			type="button"
			onclick={addExpense}
			disabled={saving}
			variant="secondary"
			size="sm"
			class="self-start"
		>
			<Wallet class="size-3.5" />
			{t('add_expense')}
		</Button>
	{/if}

	{#if mode === 'edit'}
		<button
			type="button"
			onclick={remove}
			disabled={saving}
			class="mt-1 inline-flex items-center gap-2 self-start text-sm font-medium text-danger transition-colors hover:underline disabled:opacity-50 [&_svg]:size-4"
		>
			<Trash2 />
			{t('delete')}
		</button>
	{/if}

	<button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
</form>
