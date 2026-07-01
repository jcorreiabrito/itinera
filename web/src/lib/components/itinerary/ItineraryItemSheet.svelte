<script lang="ts" module>
    let instanceCount = 0;
</script>

<script lang="ts">
    import { itinerary } from '$lib/db';
    import type { Flight, ItineraryItem, Reservation, ExpenseCategory } from '$lib/db';
    import { Button, Checkbox, Field, Input, Select, Sheet, Textarea, toast } from '$lib/components/ui';
    import { Trash2, Wallet, Plus } from 'lucide-svelte';
    import { DateTime } from 'luxon';
    import { t } from '$lib/i18n.svelte';
    import { CATEGORY_ORDER, CATEGORY_META } from './categories';
    import {
        CATEGORY_ORDER as EXPENSE_CATEGORY_ORDER,
        CATEGORY_META as EXPENSE_CATEGORY_META
    } from '../costs/labels';

    interface Props {
        open?: boolean;
        mode?: 'create' | 'edit';
        /** Bare trip ULID. */
        tripId: string;
        item?: ItineraryItem | null;
        /** Default day for a new item ('null' = Unscheduled). */
        defaultDate?: string | null;
        /** Trip days (ISO) for the day picker. */
        dates: string[];
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
        defaultDate = null,
        dates,
        flights = [],
        reservations = [],
        homeCurrency = 'EUR',
        onsaved
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
    let saving = $state(false);
    let wasOpen = false;

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

    function timeOf(value: string): string {
        if (!value) return '';
        const m = /^(\d{2}):(\d{2})/.exec(value);
        return m ? `${m[1]}:${m[2]}` : '';
    }

    function initForm() {
        errors = {};
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
    }

    $effect(() => {
        if (open && !wasOpen) initForm();
        wasOpen = open;
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
        if (!form.title.trim()) e.title = 'Give the activity a name.';
        if (form.allDay && form.startTime && form.endTime && form.endTime < form.startTime) {
            e.endTime = 'End time is before the start.';
        }
        if (form.costs.length > 0) {
            for (const cost of form.costs) {
                if (!cost.label.trim()) {
                    e.estCost = 'Enter a description for all cost items.';
                    break;
                }
                const n = Number(cost.amount);
                if (!cost.amount.trim() || !Number.isFinite(n) || n < 0) {
                    e.estCost = 'Enter valid amounts for all cost items.';
                    break;
                }
            }
        } else if (form.estCost.trim()) {
            const n = Number(form.estCost);
            if (!Number.isFinite(n) || n < 0) e.estCost = 'Enter a valid amount.';
        }
        errors = e;
        return Object.keys(e).length === 0;
    }

    function buildInput(): itinerary.NewItineraryItemInput {
        const lat = form.lat.trim() ? Number(form.lat) : undefined;
        const lng = form.lng.trim() ? Number(form.lng) : undefined;
        const hasLocation =
            form.locName.trim() || form.locAddress.trim() || lat != null || lng != null;
        
        const hasCosts = form.costs.length > 0;
        const cost = hasCosts
            ? totalCostsSum
            : (form.estCost.trim() ? Number(form.estCost) : undefined);
            
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

    async function save() {
        saving = true;
        try {
            const saved = await persist();
            if (!saved) return;
            open = false;
            onsaved?.();
        } catch {
            toast.error('Could not save the activity. Your changes are still here – try again.');
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
            if (exp) toast.success('Added to your costs.');
            else toast.error('Add an estimated cost first.');
            open = false;
            onsaved?.();
        } catch {
            toast.error('Could not add the expense. Try again.');
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
            open = false;
            toast.success('Activity removed.', {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await itinerary.restore(id);
                            onsaved?.();
                        } catch {
                            toast.error('Could not undo. Try restoring from Trash.');
                        }
                    }
                }
            });
            onsaved?.();
        } catch {
            toast.error('Could not remove the activity. Try again.');
        } finally {
            saving = false;
        }
    }
</script>

<Sheet
    bind:open
    side="right"
    title={mode === 'create' ? t('add_activity') : t('edit_expense')}
    description={mode === 'create' ? 'Plan something for your day.' : undefined}
>
    <form
        class="flex flex-col gap-4"
        onsubmit={(e) => {
            e.preventDefault();
            save();
        }}
    >
        <Field label={t('trip_name') || 'Title'} for={fid('title')} required error={errors.title}>
            <Input
                id={fid('title')}
                value={form.title}
                placeholder="e.g. Vatican Museums"
                invalid={!!errors.title}
                oninput={(e) => (form.title = e.currentTarget.value)}
            />
        </Field>

        <Field label={t('day') || 'Day'} for={fid('date')} hint="Move it to the Ideas list to plan it later.">
            <Select
                id={fid('date')}
                value={form.date}
                onchange={(e) => (form.date = e.currentTarget.value)}
            >
                <option value="">Unscheduled (Ideas)</option>
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
            <span class="font-medium text-ink">All-day</span>
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
                <option value="">No category</option>
                {#each CATEGORY_ORDER as cat (cat)}
                    <option value={cat}>{CATEGORY_META[cat].label}</option>
                {/each}
            </Select>
        </Field>

        <Field label={t('destination') || 'Location'} for={fid('locname')} hint="Where it happens (optional).">
            <Input
                id={fid('locname')}
                value={form.locName}
                placeholder="e.g. St. Peter's Square"
                oninput={(e) => (form.locName = e.currentTarget.value)}
            />
        </Field>
        <Field label="Address" for={fid('locaddr')}>
            <Input
                id={fid('locaddr')}
                value={form.locAddress}
                placeholder="Street, city"
                oninput={(e) => (form.locAddress = e.currentTarget.value)}
            />
        </Field>

        <div class="grid grid-cols-2 gap-3">
            <Field label="Latitude" for={fid('lat')}>
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
            <Field label="Longitude" for={fid('lng')}>
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
            <Field label="Link a flight" for={fid('flight')}>
                <Select
                    id={fid('flight')}
                    value={form.linkedFlightId}
                    onchange={(e) => (form.linkedFlightId = e.currentTarget.value)}
                >
                    <option value="">No flight</option>
                    {#each flights as f (f._id)}
                        <option value={f._id}>{flightLabel(f)}</option>
                    {/each}
                </Select>
            </Field>
        {/if}

        {#if showReservationLink}
            <Field label="Link a reservation" for={fid('res')}>
                <Select
                    id={fid('res')}
                    value={form.linkedReservationId}
                    onchange={(e) => (form.linkedReservationId = e.currentTarget.value)}
                >
                    <option value="">No reservation</option>
                    {#each reservations as r (r._id)}
                        <option value={r._id}>{r.name ?? 'Reservation'}</option>
                    {/each}
                </Select>
            </Field>
        {/if}

        <Field label="Notes" for={fid('notes')} hint="Markdown supported.">
            <Textarea
                id={fid('notes')}
                rows={3}
                value={form.notes}
                placeholder="Anything worth remembering..."
                oninput={(e) => (form.notes = e.currentTarget.value)}
            />
        </Field>

        <Field
            label="Estimated cost"
            for={fid('cost')}
            error={errors.estCost}
            hint={form.costs.length > 0 ? `Calculated from segregated costs below. In ${homeCurrency}.` : `In ${homeCurrency}. Use "Add as expense" to count it in your budget.`}
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
            <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-semibold text-ink">Segregated Costs</span>
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    class="h-7 px-2 text-xs"
                    onclick={addCostLine}
                >
                    <Plus class="size-3.5" /> Add line
                </Button>
            </div>

            {#if form.costs.length === 0}
                <p class="text-xs text-ink-muted mb-2">No segregated costs added. Use the single field above or add detailed lines.</p>
            {:else}
                <div class="flex flex-col gap-2 mb-3">
                    {#each form.costs as cost, index (cost.id)}
                        <div class="flex items-center gap-2">
                            <div class="flex-[2]">
                                <Input
                                    value={cost.label}
                                    placeholder="Tickets, entrance, Uber..."
                                    oninput={(e) => { form.costs[index].label = e.currentTarget.value; }}
                                />
                            </div>
                            <div class="flex-[1.5]">
                                <Select
                                    value={cost.category}
                                    onchange={(e) => { form.costs[index].category = e.currentTarget.value as ExpenseCategory; }}
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
                                    oninput={(e) => { form.costs[index].amount = e.currentTarget.value; }}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                class="text-danger hover:bg-danger/10 px-2"
                                onclick={() => removeCostLine(index)}
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

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)} disabled={saving}>{t('cancel')}</Button>
        <Button onclick={save} disabled={saving}>
            {saving ? t('saving') : mode === 'create' ? t('add_activity') : t('save_changes')}
        </Button>
    {/snippet}
</Sheet>
