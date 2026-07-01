<script lang="ts" module>
    let instanceCount = 0;
</script>

<script lang="ts">
    import { t } from '$lib/i18n.svelte';
    import { bareTripUid, trips } from '$lib/db';
    import type { Destination, Trip } from '$lib/db';
    import { Button, Field, Input, Select, Sheet, Textarea, toast } from '$lib/components/ui';
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
        'Ad hoc', 'EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF',
        'MXN', 'BRL', 'CLP', 'THB', 'SGD', 'INR', 'AED', 'ZAR',
    ].filter(c => c !== 'Ad hoc');

    interface FormState {
        title: string;
        startDate: string;
        endDate: string;
        destination: string;
        destinations: string;
        homeCurrency: string;
        budgetTotal: string;
        notes: string;
        tags: string;
        travelerCount: string;
    }

    let form = $state<FormState>(blankForm());
    let errors = $state<Partial<Record<keyof FormState, string>>>({});
    let saving = $state(false);
    let wasOpen = false;

    function blankForm(): FormState {
        return {
            title: '',
            startDate: '',
            endDate: '',
            destination: '',
            destinations: '',
            homeCurrency: defaultCurrency || 'EUR',
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
                destination: '',
                destinations: (trip.destinations ?? [])
                    .map((d) => d.name)
                    .filter(Boolean)
                    .join(', '),
                homeCurrency: trip.homeCurrency ?? defaultCurrency ?? 'EUR',
                budgetTotal: trip.budget?.total != null ? String(trip.budget.total) : '',
                notes: trip.notes ?? '',
                tags: (trip.tags ?? []).join(', '),
                travelerCount: trip.travelerCount != null ? String(trip.travelerCount) : '1'
            };
        } else {
            form = blankForm();
        }
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

    function parseDestinations(value: string): Destination[] {
        return parseList(value).map((name) => ({ name }));
    }

    function validate(): boolean {
        const e: Partial<Record<keyof FormState, string>> = {};
        if (!form.title.trim()) e.title = 'Give your trip a name.';
        if (!form.startDate) e.startDate = 'Pick a start date.';
        if (!form.endDate) e.endDate = 'Pick an end date.';
        if (form.startDate && form.endDate && form.endDate < form.startDate)
            e.endDate = 'End date is before the start date.';
        if (form.travelerCount.trim()) {
            const n = Number(form.travelerCount);
            if (!Number.isInteger(n) || n < 1) {
                e.travelerCount = 'Enter a valid number of travelers (at least 1).';
            }
        }
        if (mode === 'edit' && form.budgetTotal.trim()) {
            const n = Number(form.budgetTotal);
            if (!Number.isFinite(n) || n < 0) e.budgetTotal = 'Enter a valid amount.';
        }
        errors = e;
        return Object.keys(e).length === 0;
    }

    async function save() {
        if (!validate()) return;
        saving = true;
        try {
            if (mode === 'create') {
                const created = await trips.create({
                    title: form.title.trim(),
                    startDate: form.startDate,
                    endDate: form.endDate,
                    homeCurrency: form.homeCurrency,
                    destinations: form.destination.trim() ? [{ name: form.destination.trim() }] : [],
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
                    destinations: parseDestinations(form.destinations),
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
            toast.error('Could not save the trip. Your changes are still here – try again.');
        } finally {
            saving = false;
        }
    }
</script>

<Sheet
    bind:open
    side="right"
    title={mode === 'create' ? t('new_trip') : t('edit_trip')}
    description={mode === 'create'
        ? 'Just the essentials – you can add the rest later.'
        : undefined}
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
                placeholder="e.g. Rome & Florence"
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

        {#if mode === 'create'}
            <Field label={t('destination')} for={fid('dest')} hint="Optional – you can add more later.">
                <Input
                    id={fid('dest')}
                    value={form.destination}
                    placeholder="e.g. Rome"
                    oninput={(e) => (form.destination = e.currentTarget.value)}
                />
            </Field>
        {:else}
            <Field
                label={t('destinations')}
                for={fid('dests')}
                hint="Separate multiple places with commas."
            >
                <Input
                    id={fid('dests')}
                    value={form.destinations}
                    placeholder="Rome, Florence"
                    oninput={(e) => (form.destinations = e.currentTarget.value)}
                />
            </Field>
        {/if}

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

        <Field label={t('travelers')} for={fid('travelers')} error={errors.travelerCount} hint="Number of people traveling on this trip.">
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

        <Field label={t('budget_total')} for={fid('budget')} error={errors.budgetTotal} hint={`In ${form.homeCurrency}. Leave blank for no budget.`}>
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

        <Field label={t('tags')} for={fid('tags')} hint="Comma-separated.">
            <Input
                id={fid('tags')}
                value={form.tags}
                placeholder="family, summer"
                oninput={(e) => (form.tags = e.currentTarget.value)}
            />
        </Field>

        <Field label={t('notes')} for={fid('notes')} hint="Markdown supported.">
            <Textarea
                id={fid('notes')}
                rows={5}
                value={form.notes}
                placeholder="Anything worth remembering."
                oninput={(e) => (form.notes = e.currentTarget.value)}
            />
        </Field>

        <!-- Hidden submit keeps Enter-to-save working inside the dialog. -->
        <button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
    </form>

    {#snippet footer()}
        <Button variant="ghost" onclick={() => { open = false }} disabled={saving}>{t('cancel')}</Button>
        <Button onclick={save} disabled={saving}>
            {saving ? t('saving') : mode === 'create' ? t('create_trip') : t('save_changes')}
        </Button>
    {/snippet}
</Sheet>
