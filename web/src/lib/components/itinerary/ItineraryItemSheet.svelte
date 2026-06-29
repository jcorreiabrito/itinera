<script lang="ts" module>
    let instanceCount = 0;
</script>

<script lang="ts">
    import { itinerary } from '$lib/db';
    import type { Flight, ItineraryItem, Reservation } from '$lib/db';
    import { Button, Checkbox, Field, Input, Select, Sheet, Textarea, toast } from '$lib/components/ui';
    import { Trash2, Wallet } from 'lucide-svelte';
    import { DateTime } from 'luxon';
    import { CATEGORY_ORDER, CATEGORY_META } from './categories';

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
            estCost: ''
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
                estCost: item.estCost != null ? String(item.estCost) : ''
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
    const canAddExpense = $derived(mode === 'edit' && form.estCost.trim() !== '');

    function validate(): boolean {
        const e: Partial<Record<keyof FormState, string>> = {};
        if (!form.title.trim()) e.title = 'Give the activity a name.';
        if (form.allDay && form.startTime && form.endTime && form.endTime < form.startTime) {
            e.endTime = 'End time is before the start.';
        }
        if (form.estCost.trim()) {
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
        const cost = form.estCost.trim() ? Number(form.estCost) : undefined;
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
            currency: cost != null ? homeCurrency : undefined
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
    title={mode === 'create' ? 'Add activity' : 'Edit activity'}
    description={mode === 'create' ? 'Plan something for your day.' : undefined}
>
    <form
        class="flex flex-col gap-4"
        onsubmit={(e) => {
            e.preventDefault();
            save();
        }}
    >
        <Field label="Title" for={fid('title')} required error={errors.title}>
            <Input
                id={fid('title')}
                value={form.title}
                placeholder="e.g. Vatican Museums"
                invalid={!!errors.title}
                oninput={(e) => (form.title = e.currentTarget.value)}
            />
        </Field>

        <Field label="Day" for={fid('date')} hint="Move it to the Ideas list to plan it later.">
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
                <Field label="Start" for={fid('start')}>
                    <Input
                        id={fid('start')}
                        type="time"
                        value={form.startTime}
                        oninput={(e) => (form.startTime = e.currentTarget.value)}
                    />
                </Field>
                <Field label="End" for={fid('end')} error={errors.endTime}>
                    <Input
                        id={fid('end')}
                        type="time"
                        value={form.endTime}
                        invalid={!!errors.endTime}
                        oninput={(e) => (form.endTime = e.currentTarget.value)}
                    />
                </Field>
            </div>
        {/if}

        <Field label="Category" for={fid('cat')}>
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

        <Field label="Location" for={fid('locname')} hint="Where it happens (optional).">
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
            hint={`In ${homeCurrency}. Use "Add as expense" to count it in your budget.`}
        >
            <Input
                id={fid('cost')}
                type="number"
                inputmode="decimal"
                min={0}
                step="any"
                value={form.estCost}
                placeholder="25"
                invalid={!!errors.estCost}
                oninput={(e) => (form.estCost = e.currentTarget.value)}
            />
        </Field>

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
                Add as expense
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
                Delete activity
            </button>
        {/if}

        <button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
    </form>

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)} disabled={saving}>Cancel</Button>
        <Button onclick={save} disabled={saving}>
            {saving ? 'Saving...' : mode === 'create' ? 'Add activity' : 'Save changes'}
        </Button>
    {/snippet}
</Sheet>
