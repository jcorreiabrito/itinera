<script lang="ts" module>
	let instanceCount = 0;
</script>

<script lang="ts">
	import { trips } from '$lib/db';
	import type { Budget, Trip } from '$lib/db';
	import { untrack } from 'svelte';
	import { Button, Field, Input, Sheet, toast } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import { isDirty, snapshot } from '$lib/utils/form-dirty';
	import { CATEGORY_ORDER, CATEGORY_META } from './labels';

	interface Props {
		open?: boolean;
		/** Bare trip ULID. */
		tripId: string;
		trip: Trip | null;
		onsaved?: () => void;
	}

	let { open = $bindable(false), tripId, trip, onsaved }: Props = $props();

	const uid = ++instanceCount;
	const fid = (s: string) => `budget-${s}-${uid}`;
	const home = $derived(trip?.homeCurrency ?? 'EUR');

	type CapState = Record<string, string>;

	let total = $state('');
	let perDay = $state('');
	let caps = $state<CapState>({});
	let errors = $state<{ total?: string; perDay?: string; caps?: string }>({});
	let saving = $state(false);
	let wasOpen = false;

	/** Everything the form can change, so "edited?" stays one comparison. */
	const fields = () => ({ total, perDay, caps });
	/** The same fields as loaded; `null` until the sheet has read the trip. */
	let baseline = $state<string | null>(null);
	const dirty = $derived(isDirty(baseline, fields()));

	function num(value: number | undefined | null): string {
		return value != null ? String(value) : '';
	}

	function initForm() {
		errors = {};
		const b = trip?.budget;
		total = num(b?.total);
		perDay = num(b?.perDay);
		const next: CapState = {};
		for (const cat of CATEGORY_ORDER) next[cat] = num(b?.byCategory?.[cat]);
		caps = next;
		// `untrack`: taking the baseline must not make the open/close effect
		// depend on every field, or it would re-run on each keystroke.
		baseline = untrack(() => snapshot(fields()));
	}

	$effect(() => {
		if (open && !wasOpen) initForm();
		wasOpen = open;
	});

	function parseField(value: string): number | null | 'error' {
		const v = value.trim();
		if (!v) return null;
		const n = Number(v);
		if (!Number.isFinite(n) || n < 0) return 'error';
		return n;
	}

	async function save() {
		const e: typeof errors = {};
		const totalN = parseField(total);
		const perDayN = parseField(perDay);
		if (totalN === 'error') e.total = t('enter_valid_amount');
		if (perDayN === 'error') e.perDay = t('enter_valid_amount');

		const byCategory: Record<string, number> = {};
		for (const cat of CATEGORY_ORDER) {
			const parsed = parseField(caps[cat] ?? '');
			if (parsed === 'error') e.caps = t('category_cap_invalid');
			else if (parsed != null) byCategory[cat] = parsed;
		}
		errors = e;
		if (Object.keys(e).length > 0) return;

		const budget: Budget = {
			...(trip?.budget ?? {}),
			total: totalN === 'error' ? undefined : (totalN ?? undefined),
			perDay: perDayN === 'error' ? undefined : (perDayN ?? undefined),
			byCategory: Object.keys(byCategory).length > 0 ? byCategory : undefined
		};
		saving = true;
		try {
			await trips.update(tripId, { budget });
			open = false;
			toast.success(t('budget_saved'));
			onsaved?.();
		} catch {
			toast.error(t('could_not_save_budget'));
		} finally {
			saving = false;
		}
	}
</script>

<Sheet
	bind:open
	side="right"
	{dirty}
	title={t('edit_budget')}
	description={t('budget_sheet_desc', { currency: home })}
>
	<form
		class="flex flex-col gap-4"
		onsubmit={(e) => {
			e.preventDefault();
			save();
		}}
	>
		<Field
			label={t('overall_budget', { currency: home })}
			for={fid('total')}
			error={errors.total}
			hint={t('overall_budget_hint')}
		>
			<Input
				id={fid('total')}
				type="number"
				inputmode="decimal"
				min={0}
				step="any"
				value={total}
				placeholder="2000"
				invalid={!!errors.total}
				oninput={(e) => (total = e.currentTarget.value)}
			/>
		</Field>

		<Field
			label={t('per_day_target', { currency: home })}
			for={fid('perday')}
			error={errors.perDay}
			hint={t('per_day_hint')}
		>
			<Input
				id={fid('perday')}
				type="number"
				inputmode="decimal"
				min={0}
				step="any"
				value={perDay}
				placeholder="300"
				invalid={!!errors.perDay}
				oninput={(e) => (perDay = e.currentTarget.value)}
			/>
		</Field>

		<fieldset class="flex flex-col gap-3">
			<legend class="text-sm font-medium text-ink">
				{t('per_category_caps', { currency: home })}
			</legend>
			{#if errors.caps}<p class="text-xs text-danger">{errors.caps}</p>{/if}
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{#each CATEGORY_ORDER as cat (cat)}
					<Field label={CATEGORY_META[cat].label} for={fid(`cap-${cat}`)}>
						<Input
							id={fid(`cap-${cat}`)}
							type="number"
							inputmode="decimal"
							min={0}
							step="any"
							value={caps[cat] ?? ''}
							placeholder="—"
							oninput={(e) => (caps[cat] = e.currentTarget.value)}
						/>
					</Field>
				{/each}
			</div>
		</fieldset>

		<button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
	</form>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)} disabled={saving}>{t('cancel')}</Button>
		<Button onclick={save} disabled={saving}>{saving ? t('saving') : t('save_budget')}</Button>
	{/snippet}
</Sheet>
