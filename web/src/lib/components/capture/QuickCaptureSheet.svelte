<script lang="ts" module>
	let instanceCount = 0;
</script>

<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { Camera, ImagePlus, NotebookPen, Receipt } from 'lucide-svelte';
	import { attachments, expenses, fullTripid, itinerary, todayIso } from '$lib/db';
	import {
		AttachmentTooLargeError,
		MAX_ATTACHMENT_LABEL,
		StorageQuotaError
	} from '$lib/db/repositories/attachments';
	import {
		Button,
		Checkbox,
		ErrorState,
		Field,
		Input,
		Select,
		Sheet,
		Textarea,
		toast
	} from '$lib/components/ui';
	import {
		CATEGORY_META,
		CATEGORY_ORDER,
		categoryLabel,
		currencyOptions
	} from '$lib/components/costs/labels';
	import {
		DEFAULT_CAPTURE_MODE,
		captureDefaults,
		needsFxRate,
		normaliseCurrency,
		parseAmount,
		parseFxRate,
		photoDefaults,
		validateAmount,
		validateFxRate,
		type CaptureMode,
		type ExpenseCaptureForm,
		type NoteCaptureForm,
		type PhotoCaptureState
	} from '$lib/capture';
	import { t, type TranslationKey } from '$lib/i18n.svelte';
	import type { IconComponent } from '$lib/types';
	import { cn } from '$lib/utils';
	import { getSuggestedFxRate } from '$lib/utils/currency';
	import { isDirty, snapshot } from '$lib/utils/form-dirty';

	interface Props {
		open?: boolean;
		/** Bare trip ULID. */
		tripId: string;
		homeCurrency?: string;
		/** Seed day for a new capture (today when omitted). */
		defaultDate?: string;
		onsaved?: () => void;
	}

	let {
		open = $bindable(false),
		tripId,
		homeCurrency = 'EUR',
		defaultDate,
		onsaved
	}: Props = $props();

	const uid = ++instanceCount;
	const fid = (name: string) => `capture-${name}-${uid}`;

	const home = $derived(normaliseCurrency(homeCurrency));

	interface ModeOption {
		id: CaptureMode;
		labelKey: TranslationKey;
		icon: IconComponent;
	}

	const MODES: ModeOption[] = [
		{ id: 'expense', labelKey: 'capture_mode_expense', icon: Receipt },
		{ id: 'note', labelKey: 'capture_mode_note', icon: NotebookPen },
		{ id: 'photo', labelKey: 'capture_mode_photo', icon: Camera }
	];

	interface FormErrors {
		amount?: string;
		fxRate?: string;
		title?: string;
	}

	let mode = $state<CaptureMode>(DEFAULT_CAPTURE_MODE);
	/*
	 * Placeholders, replaced by `resetState()` when the sheet opens. Built from
	 * constants rather than the props so the initialisers do not freeze a
	 * `homeCurrency` that the trip shell had not loaded yet.
	 */
	let expenseForm = $state<ExpenseCaptureForm>(
		captureDefaults({ homeCurrency: 'EUR', today: '' }).expense
	);
	let noteForm = $state<NoteCaptureForm>(captureDefaults({ homeCurrency: 'EUR', today: '' }).note);
	let photo = $state<PhotoCaptureState>(photoDefaults());
	let noteUnscheduled = $state(false);
	let errors = $state<FormErrors>({});
	let writeError = $state<string | null>(null);
	let saving = $state(false);
	let fileInput = $state<HTMLInputElement>();
	let wasOpen = false;

	/**
	 * What a discard prompt protects: the fields, not the selected tab. Changing
	 * tabs with an empty form is not an edit; switching back keeps whatever was
	 * typed, so a half-entered expense survives a look at the photo tab.
	 */
	const fields = () => ({
		expense: expenseForm,
		note: noteForm,
		photo: photo.file ? `${photo.file.name}:${photo.file.size}:${photo.file.lastModified}` : '',
		unscheduled: noteUnscheduled
	});
	let baseline = $state<string | null>(null);
	const dirty = $derived(isDirty(baseline, fields()));

	const currency = $derived(normaliseCurrency(expenseForm.currency));
	const foreign = $derived(needsFxRate(expenseForm.currency, home));
	const saveLabel = $derived(
		mode === 'expense'
			? t('capture_save_expense')
			: mode === 'note'
				? t('capture_save_note')
				: t('capture_save_photo')
	);

	function revokePreview() {
		if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
	}

	function resetState() {
		revokePreview();
		const defaults = captureDefaults({ homeCurrency: home, defaultDate, today: todayIso() });
		expenseForm = defaults.expense;
		noteForm = defaults.note;
		photo = defaults.photo;
		noteUnscheduled = !noteForm.date;
		mode = DEFAULT_CAPTURE_MODE;
		errors = {};
		writeError = null;
		saving = false;
		baseline = null;
	}

	function initForm() {
		resetState();
		// `untrack`: taking the baseline must not make the open/close effect
		// depend on every field, or it would re-run on each keystroke.
		baseline = untrack(() => snapshot(fields()));
	}

	$effect(() => {
		if (open && !wasOpen) untrack(initForm);
		else if (!open && wasOpen) untrack(resetState);
		wasOpen = open;
	});

	onDestroy(revokePreview);

	function setMode(next: CaptureMode) {
		mode = next;
		errors = {};
		writeError = null;
	}

	function onCurrencyChange(next: string) {
		expenseForm.currency = next;
		if (needsFxRate(next, home) && !expenseForm.fxRate) {
			const suggested = getSuggestedFxRate(next, home);
			if (suggested != null) expenseForm.fxRate = String(suggested);
		}
	}

	function onAmountInput(value: string) {
		expenseForm.amount = value;
		if (errors.amount) errors = { ...errors, amount: undefined };
	}

	function onFxInput(value: string) {
		expenseForm.fxRate = value;
		if (errors.fxRate) errors = { ...errors, fxRate: undefined };
	}

	function onNoteDate(value: string) {
		noteForm.date = value;
		noteUnscheduled = !value;
	}

	function onUnscheduledChange(checked: boolean) {
		noteUnscheduled = checked;
		if (checked) noteForm.date = '';
		else if (!noteForm.date) noteForm.date = defaultDate || todayIso();
	}

	function onPickPhoto(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			writeError = t('capture_image_only');
			return;
		}
		revokePreview();
		photo = {
			file,
			previewUrl:
				typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
					? URL.createObjectURL(file)
					: null
		};
		writeError = null;
	}

	function finish() {
		// Deliberately "on this device": the write is local, and the server may
		// not have seen it yet. Claiming otherwise is the lie this sheet avoids.
		toast.success(t('capture_saved_on_device'));
		open = false;
		onsaved?.();
	}

	function saveCurrent() {
		if (saving) return;
		if (mode === 'expense') void saveExpense();
		else if (mode === 'note') void saveNote();
		else void savePhoto();
	}

	async function saveExpense() {
		const amountError = validateAmount(expenseForm.amount);
		const fxError = foreign ? validateFxRate(expenseForm.fxRate) : null;
		if (amountError || fxError) {
			errors = {
				amount:
					amountError === 'required'
						? t('capture_amount_required')
						: amountError === 'invalid'
							? t('capture_amount_invalid')
							: undefined,
				fxRate: fxError ? t('capture_fx_invalid') : undefined
			};
			return;
		}
		const amount = parseAmount(expenseForm.amount);
		if (amount == null) return;
		saving = true;
		writeError = null;
		try {
			await expenses.create(tripId, {
				description: categoryLabel(expenseForm.category),
				category: expenseForm.category,
				date: expenseForm.date || null,
				amountActual: amount,
				currency,
				fxRate: foreign ? parseFxRate(expenseForm.fxRate) : null,
				paid: expenseForm.paid,
				costType: expenseForm.costType
			});
			finish();
		} catch {
			writeError = t('capture_expense_failed');
		} finally {
			saving = false;
		}
	}

	async function saveNote() {
		if (!noteForm.title.trim()) {
			errors = { ...errors, title: t('capture_note_title_required') };
			return;
		}
		saving = true;
		writeError = null;
		try {
			await itinerary.create(tripId, {
				title: noteForm.title.trim(),
				notes: noteForm.body.trim() || undefined,
				date: noteForm.date || null,
				category: 'other'
			});
			finish();
		} catch {
			writeError = t('capture_note_failed');
		} finally {
			saving = false;
		}
	}

	function photoErrorMessage(err: unknown): string {
		if (err instanceof AttachmentTooLargeError) {
			return t('attachment_too_large', { max: MAX_ATTACHMENT_LABEL });
		}
		if (err instanceof StorageQuotaError) return t('storage_full_remove_files');
		return t('capture_photo_failed');
	}

	async function savePhoto() {
		if (!photo.file) return;
		saving = true;
		writeError = null;
		try {
			await attachments.create({
				tripid: tripId,
				ownerType: 'trip',
				ownerId: fullTripid(tripId),
				file: photo.file,
				resizeImages: true
			});
			finish();
		} catch (err) {
			writeError = photoErrorMessage(err);
		} finally {
			saving = false;
		}
	}
</script>

<Sheet
	bind:open
	side="bottom"
	{dirty}
	title={t('capture_title')}
	description={t('capture_description')}
>
	<div class="flex flex-col gap-4">
		<div
			role="group"
			aria-label={t('capture_modes')}
			class="grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface-sunken p-1"
		>
			{#each MODES as entry (entry.id)}
				{@const Icon = entry.icon}
				<button
					type="button"
					aria-pressed={mode === entry.id}
					onclick={() => setMode(entry.id)}
					class={cn(
						'flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg [&_svg]:size-5',
						mode === entry.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
					)}
				>
					<Icon aria-hidden="true" />
					<span>{t(entry.labelKey)}</span>
				</button>
			{/each}
		</div>

		<form
			class="flex flex-col gap-4"
			onsubmit={(e) => {
				e.preventDefault();
				saveCurrent();
			}}
		>
			{#if mode === 'expense'}
				<Field label={t('capture_amount')} for={fid('amount')} error={errors.amount} required>
					<Input
						id={fid('amount')}
						inputmode="decimal"
						value={expenseForm.amount}
						placeholder="0.00"
						invalid={!!errors.amount}
						oninput={(e) => onAmountInput(e.currentTarget.value)}
					/>
				</Field>

				<div class="grid grid-cols-2 gap-3">
					<Field label={t('currency')} for={fid('currency')}>
						<Select
							id={fid('currency')}
							value={expenseForm.currency}
							onchange={(e) => onCurrencyChange(e.currentTarget.value)}
						>
							{#each currencyOptions(home) as code (code)}
								<option value={code}>{code === home ? `● ${code}` : code}</option>
							{/each}
						</Select>
					</Field>

					<Field label={t('category')} for={fid('category')}>
						<Select
							id={fid('category')}
							value={expenseForm.category}
							onchange={(e) =>
								(expenseForm.category = e.currentTarget.value as ExpenseCaptureForm['category'])}
						>
							{#each CATEGORY_ORDER as cat (cat)}
								<option value={cat}>{CATEGORY_META[cat].label}</option>
							{/each}
						</Select>
					</Field>
				</div>

				{#if foreign}
					<Field
						label={t('exchange_rate_label', { from: currency, to: home })}
						for={fid('fx')}
						error={errors.fxRate}
						hint={t('fx_manual_hint')}
					>
						<Input
							id={fid('fx')}
							inputmode="decimal"
							value={expenseForm.fxRate}
							placeholder="0.92"
							invalid={!!errors.fxRate}
							oninput={(e) => onFxInput(e.currentTarget.value)}
						/>
					</Field>
				{/if}

				<Field label={t('label_day')} for={fid('date')}>
					<Input
						id={fid('date')}
						type="date"
						value={expenseForm.date}
						oninput={(e) => (expenseForm.date = e.currentTarget.value)}
					/>
				</Field>

				<Checkbox
					label={t('paid')}
					description={t('paid_desc')}
					bind:checked={expenseForm.paid}
					onchange={(e) => (expenseForm.paid = e.currentTarget.checked)}
				/>
			{:else if mode === 'note'}
				<Field label={t('title')} for={fid('title')} required error={errors.title}>
					<Input
						id={fid('title')}
						maxlength={120}
						value={noteForm.title}
						placeholder={t('capture_note_title_placeholder')}
						invalid={!!errors.title}
						oninput={(e) => {
							noteForm.title = e.currentTarget.value;
							if (errors.title) errors = { ...errors, title: undefined };
						}}
					/>
				</Field>

				<Field label={t('notes')} for={fid('body')}>
					<Textarea
						id={fid('body')}
						rows={5}
						value={noteForm.body}
						placeholder={t('capture_note_body_placeholder')}
						oninput={(e) => (noteForm.body = e.currentTarget.value)}
					/>
				</Field>

				<div class="flex flex-col gap-2">
					<Field
						label={t('label_day')}
						for={fid('note-date')}
						class={noteUnscheduled ? 'opacity-50' : ''}
					>
						<Input
							id={fid('note-date')}
							type="date"
							value={noteForm.date}
							disabled={noteUnscheduled}
							oninput={(e) => onNoteDate(e.currentTarget.value)}
						/>
					</Field>
					<Checkbox
						label={t('capture_unscheduled')}
						description={t('capture_unscheduled_hint')}
						bind:checked={noteUnscheduled}
						onchange={(e) => onUnscheduledChange(e.currentTarget.checked)}
					/>
				</div>
			{:else}
				<p class="text-sm text-ink-muted">{t('capture_photo_hint')}</p>

				<input
					bind:this={fileInput}
					type="file"
					accept="image/*"
					capture="environment"
					class="sr-only"
					aria-label={t('capture_take_photo')}
					onchange={onPickPhoto}
				/>

				{#if photo.previewUrl}
					<div class="overflow-hidden rounded-lg border border-border bg-surface-sunken">
						<img
							src={photo.previewUrl}
							alt={t('capture_photo_preview')}
							class="mx-auto max-h-64 w-full object-contain"
						/>
					</div>
					<Button
						type="button"
						variant="secondary"
						onclick={() => fileInput?.click()}
						disabled={saving}
					>
						<ImagePlus class="size-4" />
						{t('capture_change_photo')}
					</Button>
				{:else}
					<button
						type="button"
						onclick={() => fileInput?.click()}
						class="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-sunken px-4 py-6 text-sm font-medium text-ink-muted transition-colors hover:border-primary-600 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
					>
						<Camera class="size-6" aria-hidden="true" />
						{t('capture_take_photo')}
					</button>
				{/if}

				{#if photo.file}
					<p class="truncate text-xs text-ink-muted">{photo.file.name}</p>
				{/if}
			{/if}

			<button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
		</form>

		{#if writeError}
			<ErrorState
				title={t('capture_save_failed_title')}
				description={writeError}
				onretry={saveCurrent}
				retrying={saving}
				class="px-4 py-5"
			/>
		{/if}
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)} disabled={saving}>{t('cancel')}</Button>
		<Button onclick={saveCurrent} disabled={saving || (mode === 'photo' && !photo.file)}>
			{saving ? t('saving') : saveLabel}
		</Button>
	{/snippet}
</Sheet>
