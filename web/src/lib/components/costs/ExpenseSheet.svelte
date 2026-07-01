<script lang="ts" module>
    let instanceCount = 0;
</script>

<script lang="ts">
    import { Trash2 } from 'lucide-svelte';
    import { convertToHome, expenses, flights, itinerary, reservations, todayIso } from '$lib/db';
    import type { Expense, ExpenseCategory, LinkedType } from '$lib/db';
    import { Button, Checkbox, Field, Input, Select, Sheet, Textarea, toast } from '$lib/components/ui';
    import { formatMoney } from '$lib/format';
    import { t } from '$lib/i18n.svelte';
    import {
        CATEGORY_META,
        CATEGORY_ORDER,
        categoryLabel,
        currencyOptions,
        sourceMeta
    } from './labels';

    interface Props {
        open?: boolean;
        mode?: 'create' | 'edit';
        /** Bare trip ULID. */
        tripId: string;
        expense?: Expense | null;
        homeCurrency?: string;
        /** Seed date for a fresh expense (defaults to today). */
        defaultDate?: string;
        onsaved?: () => void;
    }

    let {
        open = $bindable(false),
        mode = 'create',
        tripId,
        expense = null,
        homeCurrency = 'EUR',
        defaultDate,
        onsaved
    }: Props = $props();

    const uid = ++instanceCount;
    const fid = (s: string) => `exp-${s}-${uid}`;
    const home = $derived((homeCurrency || 'EUR').toUpperCase());

    import { trips } from '$lib/db';

    interface FormState {
        description: string;
        category: ExpenseCategory;
        amountEstimate: string;
        amountActual: string;
        currency: string;
        fxRate: string;
        date: string;
        wholeTrip: boolean;
        paid: boolean;
        link: string;
        costType: 'total' | 'per_person';
    }

    interface LinkOption {
        id: string;
        label: string;
    }

    let form = $state<FormState>(blankForm());
    let errors = $state<Partial<Record<keyof FormState, string>>>({});
    let saving = $state(false);
    let wasOpen = false;
    let flightOpts = $state<LinkOption[]>([]);
    let resOpts = $state<LinkOption[]>([]);
    let itemOpts = $state<LinkOption[]>([]);
    let travelerCount = $state(1);

    const isLinked = $derived(mode === 'edit' && !!expense?.linkedType);
    const source = $derived(sourceMeta(expense?.linkedType));

    function blankForm(): FormState {
        return {
            description: '',
            category: 'food',
            amountEstimate: '',
            amountActual: '',
            currency: home,
            fxRate: '',
            date: defaultDate ?? todayIso(),
            wholeTrip: false,
            paid: false,
            link: '',
            costType: 'total'
        };
    }

    async function loadTravelerCount() {
        if (tripId) {
            try {
                const t = await trips.get(tripId);
                travelerCount = t?.travelerCount ?? 1;
            } catch {
                travelerCount = 1;
            }
        }
    }

    function initForm() {
        errors = {};
        void loadTravelerCount();
        if (mode === 'edit' && expense) {
            form = {
                description: expense.description ?? '',
                category: (expense.category as ExpenseCategory) ?? 'other',
                amountEstimate: expense.amountEstimate != null ? String(expense.amountEstimate) : '',
                amountActual: expense.amountActual != null ? String(expense.amountActual) : '',
                currency: (expense.currency ?? home).toUpperCase(),
                fxRate: expense.fxRate != null ? String(expense.fxRate) : '',
                date: expense.date ?? '',
                wholeTrip: !expense.date,
                paid: expense.paid ?? false,
                link:
                    expense.linkedType && expense.linkedId
                        ? `${expense.linkedType}:${expense.linkedId}`
                        : '',
                costType: expense.costType ?? 'total'
            };
        } else {
            form = blankForm();
        }
        if (!isLinked) void loadCandidates();
    }

    $effect(() => {
        if (open && !wasOpen) initForm();
        wasOpen = open;
    });

    async function loadCandidates() {
        try {
            const [fl, rs, it] = await Promise.all([
                flights.byTrip(tripId),
                reservations.byTrip(tripId),
                itinerary.byTrip(tripId)
            ]);
            flightOpts = fl.map((f) => ({ id: f._id, label: flights.computeFlight(f).route ? `Flight: ${flights.computeFlight(f).route}` : 'Flight' }));
            resOpts = rs.map((r) => ({ id: r._id, label: r.name?.trim() ?? 'Reservation' }));
            itemOpts = it.map((i) => ({ id: i._id, label: i.title?.trim() ?? 'Activity' }));
        } catch {
            flightOpts = [];
            resOpts = [];
            itemOpts = [];
        }
    }

    const cur = $derived((form.currency.trim() || home).toUpperCase());
    const foreign = $derived(cur !== home);
    const estNum = $derived(numOrNull(form.amountEstimate));
    const actNum = $derived(numOrNull(form.amountActual));
    const fxNum = $derived(numOrNull(form.fxRate));

    function numOrNull(value: string): number | null {
        const v = value.trim();
        if (!v) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    function parseLink(value: string): { type: LinkedType; id: string } | null {
        if (!value) return null;
        const i = value.indexOf(':');
        if (i < 0) return null;
        return { type: value.slice(0, i) as LinkedType, id: value.slice(i + 1) };
    }

    function validate(): boolean {
        const e: Partial<Record<keyof FormState, string>> = {};
        const checkAmount = (raw: string, key: 'amountEstimate' | 'amountActual') => {
            if (raw.trim()) return;
            const n = Number(raw);
            if (!Number.isFinite(n) || n < 0) e[key] = 'Enter a valid amount.';
        };
        checkAmount(form.amountEstimate, 'amountEstimate');
        checkAmount(form.amountActual, 'amountActual');

        if (!isLinked && !form.amountEstimate.trim() && !form.amountActual.trim()) {
            e.amountActual = 'Enter an estimated or actual amount.';
        }
        if (form.fxRate.trim()) {
            const n = Number(form.fxRate);
            if (!Number.isFinite(n) || n <= 0) e.fxRate = 'Enter a positive rate.';
        }
        errors = e;
        return Object.keys(e).length === 0;
    }

    async function save() {
        if (!validate()) return;
        saving = true;
        try {
            const fx = foreign ? fxNum : null;
            if (isLinked && expense) {
                // Booking owns amount/category/description – only these are editable here.
                await expenses.update(expense._id, {
                    amountActual: actNum,
                    fxRate: fx,
                    paid: form.paid,
                    costType: form.costType
                });
            } else {
                const link = parseLink(form.link);
                const payload = {
                    description: form.description.trim() || categoryLabel(form.category),
                    category: form.category,
                    date: form.wholeTrip ? null : form.date || null,
                    amountEstimate: estNum,
                    amountActual: actNum,
                    currency: cur,
                    fxRate: fx,
                    paid: form.paid,
                    linkedType: link?.type ?? null,
                    linkedId: link?.id ?? null,
                    costType: form.costType
                };
                if (mode === 'create') await expenses.create(tripId, payload);
                else if (expense) await expenses.update(expense._id, payload);
            }
            open = false;
            onsaved?.();
        } catch {
            toast.error('Could not save the expense. Your changes are still here – try again.');
        } finally {
            saving = false;
        }
    }

    async function remove() {
        if (!expense) return;
        const id = expense._id;
        saving = true;
        try {
            await expenses.softDelete(id);
            open = false;
            toast.success('Expense removed.', {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await expenses.restore(id);
                            onsaved?.();
                        } catch {
                            toast.error('Could not undo. Try restoring from Trash.');
                        }
                    }
                }
            });
            onsaved?.();
        } catch {
            toast.error('Could not remove the expense. Try again.');
        } finally {
            saving = false;
        }
    }
</script>

<Sheet
    bind:open
    side="right"
    title={mode === 'create' ? t('add_expense') : t('edit_expense')}
    description={isLinked
        ? 'Linked to a booking – record what you actually paid. Log a cost; refine the details anytime.'
        : ''}
>
    <form
        class="flex flex-col gap-4"
        onsubmit={(e) => {
            e.preventDefault();
            save();
        }}
    >
        {#if isLinked && source}
            {@const SrcIcon = source.icon}
            <div
                class="flex items-start gap-2 rounded-md border border-info/30 bg-info/10 px-3 py-2 text-sm text-info [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0"
            >
                <SrcIcon aria-hidden="true" />
                <span>
                    {source.label}
                    <span class="block text-xs opacity-70">
                        The amount and category come from the booking; set the actual amount and
                        paid status below. Manage or remove it from Bookings.
                    </span>
                </span>
            </div>
        {/if}

        <Field label={t('description')} for={fid('desc')}>
            <Input
                id={fid('desc')}
                value={form.description}
                disabled={isLinked}
                placeholder={CATEGORY_META[form.category].label}
                oninput={(e) => (form.description = e.currentTarget.value)}
            />
        </Field>

        <Field label={t('category')} for={fid('cat')}>
            <Select
                id={fid('cat')}
                value={form.category}
                disabled={isLinked}
                onchange={(e) => (form.category = e.currentTarget.value as ExpenseCategory)}
            >
                {#each CATEGORY_ORDER as catkey (catkey)}
                    <option value={catkey}>{CATEGORY_META[catkey].label}</option>
                {/each}
            </Select>
        </Field>

        <div class="grid grid-cols-2 gap-3">
            <Field label={t('estimated')} for={fid('est')} error={errors.amountEstimate}>
                <Input
                    id={fid('est')}
                    type="number"
                    inputmode="decimal"
                    min={0}
                    step="any"
                    value={form.amountEstimate}
                    placeholder="0"
                    disabled={isLinked}
                    invalid={!!errors.amountEstimate}
                    oninput={(e) => (form.amountEstimate = e.currentTarget.value)}
                />
            </Field>

            <Field label={t('actual')} for={fid('act')} error={errors.amountActual}>
                <Input
                    id={fid('act')}
                    type="number"
                    inputmode="decimal"
                    min={0}
                    step="any"
                    value={form.amountActual}
                    placeholder="0"
                    invalid={!!errors.amountActual}
                    oninput={(e) => (form.amountActual = e.currentTarget.value)}
                />
            </Field>
        </div>

        {#if travelerCount > 1}
            <Field label={t('cost_distribution')} for={fid('cost-dist')} hint="Select if this amount is the total cost or cost per person.">
                <Select
                    id={fid('cost-dist')}
                    value={form.costType}
                    onchange={(e) => (form.costType = e.currentTarget.value as 'total' | 'per_person')}
                >
                    <option value="total">{t('total_cost_split')}</option>
                    <option value="per_person">{t('per_person_cost')}</option>
                </Select>
            </Field>
        {/if}

        <Field label={t('home_currency')} for={fid('cur')}>
            <Select
                id={fid('cur')}
                value={form.currency}
                disabled={isLinked}
                onchange={(e) => (form.currency = e.currentTarget.value)}
            >
                {#each currencyOptions(home) as code (code)}
                    <option value={code}>{code === home ? `● ${home}` : code}</option>
                {/each}
            </Select>
        </Field>

        {#if foreign}
            <Field
                label={`Exchange rate (1 ${cur} = ? ${home})`}
                for={fid('fx')}
                error={errors.fxRate}
                hint="A manual snapshot – no network needed."
            >
                <Input
                    id={fid('fx')}
                    type="number"
                    inputmode="decimal"
                    min={0}
                    step="any"
                    value={form.fxRate}
                    placeholder="e.g. 0.92"
                    invalid={!!errors.fxRate}
                    oninput={(e) => (form.fxRate = e.currentTarget.value)}
                />
            </Field>
            {#if fxNum == null}
                <p class="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                    Without a rate this expense is excluded from {home} totals until you add one.
                </p>
            {:else}
                <p class="mt-2 text-xs text-ink-muted tabular-nums">
                    {#if estNum != null}Estimated = {formatMoney(convertToHome(estNum, cur, home, fxNum) ?? 0, home)}{/if}
                    {#if estNum != null && actNum != null}<span aria-hidden="true"> · </span>{/if}
                    {#if actNum != null}Actual = {formatMoney(convertToHome(actNum, cur, home, fxNum) ?? 0, home)}{/if}
                    {#if estNum != null || actNum != null}
                        <span class="block text-ink-muted/60">
                            Enter an amount to preview the converted total.
                        </span>
                    {/if}
                </p>
            {/if}
        {/if}

        <div class="flex flex-col gap-2">
            <Field label="Day" for={fid('date')} class={form.wholeTrip ? 'opacity-50' : ''}>
                <Input
                    id={fid('date')}
                    type="date"
                    value={form.date}
                    disabled={isLinked || form.wholeTrip}
                    oninput={(e) => (form.date = e.currentTarget.value)}
                />
            </Field>
            {#if !isLinked}
                <Checkbox
                    label="Whole-trip cost (no specific day)"
                    description="Flights, insurance and other trip-wide spend."
                    bind:checked={form.wholeTrip}
                    onchange={(e) => (form.wholeTrip = e.currentTarget.checked)}
                />
            {/if}
        </div>

        {#if !isLinked}
            <Field label="Link to a booking (optional)" for={fid('link')}>
                <Select
                    id={fid('link')}
                    value={form.link}
                    onchange={(e) => (form.link = e.currentTarget.value)}
                >
                    <option value="">None</option>
                    {#if flightOpts.length > 0}
                        <optgroup label="Flights">
                            {#each flightOpts as opt (opt.id)}
                                <option value={`flight:${opt.id}`}>{opt.label}</option>
                            {/each}
                        </optgroup>
                    {/if}
                    {#if resOpts.length > 0}
                        <optgroup label="Reservations">
                            {#each resOpts as opt (opt.id)}
                                <option value={`reservation:${opt.id}`}>{opt.label}</option>
                            {/each}
                        </optgroup>
                    {/if}
                    {#if itemOpts.length > 0}
                        <optgroup label="Itinerary">
                            {#each itemOpts as opt (opt.id)}
                                <option value={`itineraryItem:${opt.id}`}>{opt.label}</option>
                            {/each}
                        </optgroup>
                    {/if}
                </Select>
            </Field>
        {/if}

        <Checkbox
            label={t('paid') || 'Paid'}
            description="Cleared from your outstanding (unpaid) total."
            bind:checked={form.paid}
            onchange={(e) => (form.paid = e.currentTarget.checked)}
        />

        {#if mode === 'edit' && !isLinked}
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

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)} disabled={saving}>{t('cancel')}</Button>
        <Button onclick={save} disabled={saving}>
            {saving ? t('saving') : mode === 'create' ? t('add_expense') : t('save_changes')}
        </Button>
    {/snippet}
</Sheet>
