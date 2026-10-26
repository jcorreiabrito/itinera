<script lang="ts" module>
	let instanceCount = 0;
</script>

<script lang="ts">
	import { ChevronDown, Clipboard } from 'lucide-svelte';
	import { Badge, Button, Checkbox, Field, Textarea } from '$lib/components/ui';
	import { formatDate } from '$lib/format';
	import { t, type TranslationKey } from '$lib/i18n.svelte';
	import {
		fieldEntries,
		parseConfirmation,
		type Confidence,
		type ParsedFieldKey
	} from '$lib/parse-confirmation';

	export type PasteTarget = 'reservation' | 'flight';

	interface Props {
		target: PasteTarget;
		/** Current form values, keyed like the parser's fields. */
		current?: Partial<Record<ParsedFieldKey, string>>;
		/** Selected values plus the text the parser could not use (may be empty). */
		onapply: (values: Partial<Record<ParsedFieldKey, string>>, leftover: string) => void;
	}

	let { target, current = {}, onapply }: Props = $props();

	const uid = ++instanceCount;
	const fid = (s: string) => `paste-${s}-${uid}`;

	/** Only offer the fields the destination sheet can actually store. */
	const TARGET_FIELDS: Record<PasteTarget, readonly ParsedFieldKey[]> = {
		reservation: [
			'name',
			'address',
			'phone',
			'email',
			'bookingRef',
			'startDate',
			'startTime',
			'endDate',
			'endTime',
			'partySize'
		],
		flight: [
			'flightNumber',
			'departureAirport',
			'arrivalAirport',
			'passenger',
			'startDate',
			'startTime',
			'endDate',
			'endTime',
			'bookingRef'
		]
	};

	const LABEL_KEYS: Record<ParsedFieldKey, TranslationKey> = {
		name: 'paste_field_name',
		address: 'paste_field_address',
		phone: 'paste_field_phone',
		email: 'paste_field_email',
		bookingRef: 'paste_field_booking_ref',
		startDate: 'paste_field_start_date',
		startTime: 'paste_field_start_time',
		endDate: 'paste_field_end_date',
		endTime: 'paste_field_end_time',
		partySize: 'paste_field_party_size',
		flightNumber: 'paste_field_flight_number',
		departureAirport: 'paste_field_departure_airport',
		arrivalAirport: 'paste_field_arrival_airport',
		passenger: 'paste_field_passenger'
	};

	const DATE_KEYS: ReadonlySet<ParsedFieldKey> = new Set(['startDate', 'endDate']);

	let open = $state(false);
	let pasted = $state('');
	let parsedFields = $state<ReturnType<typeof fieldEntries>>([]);
	let hasParsed = $state(false);
	let leftover = $state('');
	let selected = $state<Partial<Record<ParsedFieldKey, boolean>>>({});
	let replace = $state<Partial<Record<ParsedFieldKey, boolean>>>({});
	let error = $state<string | null>(null);
	let status = $state<string | null>(null);

	function fieldLabel(key: ParsedFieldKey): string {
		if (target === 'flight') {
			if (key === 'startDate') return t('paste_field_departure_date');
			if (key === 'startTime') return t('paste_field_departure_time');
			if (key === 'endDate') return t('paste_field_arrival_date');
			if (key === 'endTime') return t('paste_field_arrival_time');
		}
		return t(LABEL_KEYS[key]);
	}

	function display(key: ParsedFieldKey, value: string): string {
		return DATE_KEYS.has(key) ? formatDate(value) : value;
	}

	function confidenceLabel(confidence: Confidence): string {
		return confidence === 'high' ? t('paste_confidence_high') : t('paste_confidence_medium');
	}

	interface Row {
		key: ParsedFieldKey;
		value: string;
		confidence: Confidence;
		label: string;
		selected: boolean;
		replace: boolean;
		currentValue: string;
	}

	const rows = $derived.by<Row[]>(() =>
		parsedFields
			.filter((field) => TARGET_FIELDS[target].includes(field.key))
			.map((field) => {
				const currentValue = (current[field.key] ?? '').trim();
				return {
					key: field.key,
					value: field.value,
					confidence: field.confidence,
					label: fieldLabel(field.key),
					selected: selected[field.key] ?? true,
					replace: replace[field.key] ?? false,
					currentValue
				};
			})
	);

	function resetResults() {
		hasParsed = false;
		parsedFields = [];
		leftover = '';
		selected = {};
		replace = {};
		error = null;
		status = null;
	}

	function runParse() {
		const result = parseConfirmation(pasted);
		parsedFields = fieldEntries(result).filter((field) =>
			TARGET_FIELDS[target].includes(field.key)
		);
		leftover = result.unparsed.join('\n');
		selected = {};
		replace = {};
		error = null;
		status = null;
		hasParsed = true;
	}

	function toggleSelected(key: ParsedFieldKey) {
		selected = { ...selected, [key]: !(selected[key] ?? true) };
		error = null;
	}

	function toggleReplace(key: ParsedFieldKey) {
		replace = { ...replace, [key]: !(replace[key] ?? false) };
	}

	function apply() {
		const chosen = rows.filter((row) => row.selected);
		if (chosen.length === 0) {
			error = t('paste_no_selection');
			return;
		}
		const values: Partial<Record<ParsedFieldKey, string>> = {};
		for (const row of chosen) {
			// A filled field keeps its value unless this row opted in to replacing it.
			if (row.currentValue && !row.replace) continue;
			values[row.key] = row.value;
		}
		onapply(values, leftover);
		const count = Object.keys(values).length;
		status = count > 0 ? t('paste_applied', { count: String(count) }) : t('paste_no_change');
		error = null;
		// The results are consumed: applying twice would append the same leftover
		// text to the notes twice. The pasted text stays for a fresh read.
		parsedFields = [];
		leftover = '';
		selected = {};
		replace = {};
		hasParsed = false;
		open = false;
	}
</script>

<details bind:open class="group rounded-xl border border-border bg-surface-sunken/40">
	<summary
		class="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg [&::-webkit-details-marker]:hidden"
	>
		<span class="flex items-center gap-2">
			<Clipboard class="size-4 text-ink-muted" aria-hidden="true" />
			{t('paste_title')}
		</span>
		<ChevronDown
			class="size-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
			aria-hidden="true"
		/>
	</summary>

	<div class="flex flex-col gap-3 px-4 pb-4 pt-1">
		<p class="text-xs text-ink-muted">{t('paste_description')}</p>

		<Field label={t('paste_textarea_label')} for={fid('text')}>
			<Textarea
				id={fid('text')}
				rows={5}
				value={pasted}
				placeholder={t('paste_textarea_placeholder')}
				oninput={(e) => {
					pasted = e.currentTarget.value;
					resetResults();
				}}
			/>
		</Field>

		<div class="flex flex-wrap items-center gap-2">
			<Button size="sm" onclick={runParse} disabled={!pasted.trim()}>{t('paste_parse')}</Button>
			<span class="text-xs text-ink-muted">{t('paste_kept_in_notes')}</span>
		</div>

		{#if hasParsed}
			{#if rows.length === 0}
				<p class="text-sm text-ink-muted" role="status">{t('paste_nothing_found')}</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each rows as row (row.key)}
						<li class="rounded-lg border border-border bg-surface p-2">
							<div class="flex items-start gap-2">
								<Checkbox
									class="min-h-[44px] flex-1 p-1"
									checked={row.selected}
									label={row.label}
									description={display(row.key, row.value)}
									onchange={() => toggleSelected(row.key)}
								/>
								<Badge
									variant={row.confidence === 'high' ? 'success' : 'neutral'}
									class="mt-2 shrink-0"
								>
									<span aria-hidden="true">{confidenceLabel(row.confidence)}</span>
									<span class="sr-only">
										{t('paste_confidence_aria', { level: confidenceLabel(row.confidence) })}
									</span>
								</Badge>
							</div>
							{#if row.currentValue}
								<div class="mt-1 pl-8">
									<Checkbox
										class="min-h-[44px] p-1"
										checked={row.replace}
										label={t('paste_replace')}
										description={t('paste_current_value', {
											value: display(row.key, row.currentValue)
										})}
										onchange={() => toggleReplace(row.key)}
									/>
								</div>
							{/if}
						</li>
					{/each}
				</ul>

				{#if error}
					<p class="text-xs text-danger" role="alert">{error}</p>
				{/if}

				<Button size="sm" onclick={apply}>{t('paste_apply')}</Button>
			{/if}
		{/if}
	</div>
</details>

{#if status}
	<p class="mt-2 text-xs text-ink-muted" role="status">{status}</p>
{/if}
