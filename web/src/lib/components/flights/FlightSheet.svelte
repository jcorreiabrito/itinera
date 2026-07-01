<script lang="ts" module>
    let instanceCount = 0;
</script>

<script lang="ts">
    import { flights } from '$lib/db';
    import type { Attachment, Flight, FlightSegment } from '$lib/db';
    import { Button, Field, Input, Select, Sheet, Textarea, toast } from '$lib/components/ui';
    import { AttachmentField } from '$lib/components/attachments';
    import { AlertTriangle, ArrowRight, Plane, Plus, Trash2 } from 'lucide-svelte';
    import FlightLegFields, { type FormLeg } from './FlightLegFields.svelte';
    import { endpointCode } from './labels';
    import { t } from '$lib/i18n.svelte';

    interface Props {
        open?: boolean;
        mode?: 'create' | 'edit';
        /** Bare trip ULID. */
        tripId: string;
        flight?: Flight | null;
        homeCurrency?: string;
        onsaved?: () => void;
    }

    let {
        open = $bindable(false),
        mode = 'create',
        tripId,
        flight = null,
        homeCurrency = 'EUR',
        onsaved
    }: Props = $props();

    const uid = ++instanceCount;
    const fid = (s: string) => `flt-${s}-${uid}`;

    import { trips } from '$lib/db';

    // Booking-level fields. `notes` is persisted via `update` (see save()).
    type FlightPatch = Partial<flights.NewFlightInput> & { notes?: string };

    let bookingRef = $state('');
    let checkInUrl = $state('');
    let cost = $state('');
    let currency = $state('');
    let notes = $state('');
    let costType = $state<'total' | 'per_person'>('total');
    let travelerCount = $state(1);
    let legs = $state<FormLeg[]>([]);
    let saving = $state(false);
    let formError = $state<string | null>(null);
    let wasOpen = false;

    let attachmentItems = $state<Attachment[]>([]);

    function blankLeg(from?: FormLeg['from']): FormLeg {
        return {
            airline: '',
            flightNumber: '',
            from,
            to: undefined,
            departLocal: '',
            arriveLocal: '',
            seat: '',
            terminal: '',
            gate: '',
            baggage: '',
            checkInOpensAt: ''
        };
    }

    function toLocalInput(value?: string): string {
        if (!value) return '';
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
        return m ? `${m[1]}T${m[2]}${m[3]}` : '';
    }

    function segToLeg(seg: FlightSegment): FormLeg {
        return {
            airline: seg.airline ?? '',
            flightNumber: seg.flightNumber ?? '',
            from: seg.from,
            to: seg.to,
            departLocal: toLocalInput(seg.departLocal),
            arriveLocal: toLocalInput(seg.arriveLocal),
            seat: seg.seat ?? '',
            terminal: seg.terminal ?? '',
            gate: seg.gate ?? '',
            baggage: seg.baggage ?? '',
            checkInOpensAt: toLocalInput(seg.checkInOpensAt)
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
        formError = null;
        void loadTravelerCount();
        if (mode === 'edit' && flight) {
            bookingRef = flight.bookingRef ?? '';
            checkInUrl = flight.checkInUrl ?? '';
            cost = flight.cost != null ? String(flight.cost) : '';
            currency = flight.currency ?? homeCurrency;
            notes = (flight as Flight & { notes?: string }).notes ?? '';
            costType = flight.costType ?? 'total';
            const segs = flight.segments ?? [];
            legs = segs.length ? segs.map(segToLeg) : [blankLeg()];
            void loadAttachments();
        } else {
            bookingRef = '';
            checkInUrl = '';
            cost = '';
            currency = homeCurrency;
            notes = '';
            costType = 'total';
            legs = [blankLeg()];
            attachmentItems = [];
        }
    }

    $effect(() => {
        if (open && !wasOpen) {
            initForm();
        }
        wasOpen = open;
    });

    async function loadAttachments() {
        if (!flight) return;
        try {
            attachmentItems = await flights.listAttachments(flight._id);
        } catch {
            attachmentItems = [];
        }
    }

    function toSegment(leg: FormLeg): FlightSegment {
        return {
            airline: leg.airline.trim() || undefined,
            flightNumber: leg.flightNumber.trim() || undefined,
            from: leg.from,
            to: leg.to,
            departLocal: leg.departLocal || undefined,
            arriveLocal: leg.arriveLocal || undefined,
            seat: leg.seat.trim() || undefined,
            terminal: leg.terminal.trim() || undefined,
            gate: leg.gate.trim() || undefined,
            baggage: leg.baggage.trim() || undefined,
            checkInOpensAt: leg.checkInOpensAt || undefined
        };
    }

    const liveSegments = $derived(legs.map(toSegment));
    // All derived display (durations, layovers, "n+1") comes from computeFlight.
    const computed = $derived(flights.computeFlight({ segments: liveSegments } as Flight));

    const legErrors = $derived(
        computed.segments.map((s) =>
            s.durationMinutes != null && s.durationMinutes < 0
                ? 'Arrival is before departure – check the times and time zones.'
                : null
        )
    );

    const layoverWarnings = $derived(
        computed.layovers.map((l) => {
            if (l.minutes == null) return null;
            if (l.minutes < 0)
                return `Overlapping connection (${l.text}) – this leg departs before the previous one lands.`;
            if (l.tight) return `Tight connection · ${l.text}`;
            return null;
        })
    );

    const routeOk = $derived(!!(legs[0]?.from && legs[legs.length - 1]?.to));

    function addLeg() {
        legs = [...legs, blankLeg(legs[legs.length - 1]?.to)];
    }

    function removeLeg(index: number) {
        legs = legs.filter((_, i) => i !== index);
    }

    function validate(): boolean {
        if (!routeOk) {
            formError = 'Add at least a From and To airport for the route.';
            return false;
        }
        if (legErrors.some(Boolean)) {
            formError = 'Fix the leg times before saving.';
            return false;
        }
        formError = null;
        return true;
    }

    function buildInput(): flights.NewFlightInput {
        const amount = cost.trim() ? Number(cost) : null;
        const validCost = amount != null && Number.isFinite(amount) && amount >= 0 ? amount : null;
        return {
            segments: liveSegments,
            bookingRef: bookingRef.trim() || undefined,
            checkInUrl: checkInUrl.trim() || undefined,
            // Setting cost unserts a linked transport expense in the repo; null clears it.
            cost: validCost,
            currency: validCost != null ? currency.trim().toUpperCase() || homeCurrency : undefined,
            costType: costType
        };
    }

    async function save() {
        if (!validate()) return;
        saving = true;
        try {
            const input = buildInput();
            const note = notes.trim();
            if (mode === 'create') {
                const created = await flights.create(tripId, input);
                if (note) {
                    const patch: FlightPatch = { notes: note };
                    await flights.update(created._id, patch);
                }
            } else if (flight) {
                const patch: FlightPatch = { ...input, notes: note || undefined };
                await flights.update(flight._id, patch);
            }
            open = false;
            onsaved?.();
        } catch {
            toast.error('Could not save the flight. Your changes are still here – try again.');
        } finally {
            saving = false;
        }
    }

    async function remove() {
        if (!flight) return;
        const id = flight._id;
        saving = true;
        try {
            await flights.softDelete(id);
            open = false;
            toast.success('Flight removed.', {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await flights.restore(id);
                            onsaved?.();
                        } catch {
                            toast.error('Could not undo. Try restoring from Trash.');
                        }
                    }
                }
            });
            onsaved?.();
        } catch {
            toast.error('Could not remove the flight. Try again.');
        } finally {
            saving = false;
        }
    }
</script>

<Sheet
    bind:open
    side="right"
    title={mode === 'create' ? t('add_flight') : t('edit_expense')}
    description="One booking can hold every leg – outbound, return and connections."
>
    <form
        class="flex flex-col gap-4"
        onsubmit={(e) => {
            e.preventDefault();
            save();
        }}
    >
        <!-- Booking-level fields -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Booking ref / PNR" for={fid('ref')}>
                <Input
                    id={fid('ref')}
                    value={bookingRef}
                    placeholder="ABC123"
                    oninput={(e) => (bookingRef = e.currentTarget.value)}
                />
            </Field>
            <Field label="Online check-in URL" for={fid('ci')}>
                <Input
                    id={fid('ci')}
                    type="url"
                    value={checkInUrl}
                    placeholder="https://..."
                    oninput={(e) => (checkInUrl = e.currentTarget.value)}
                />
            </Field>
        </div>

        <div class="grid grid-cols-[1fr_7rem] gap-3">
            <Field
                label={t('cost')}
                for={fid('cost')}
                hint="Adds one linked expense to your budget – no double-counting."
            >
                <Input
                    id={fid('cost')}
                    type="number"
                    inputmode="decimal"
                    min={0}
                    step="any"
                    value={cost}
                    placeholder="220"
                    oninput={(e) => (cost = e.currentTarget.value)}
                />
            </Field>
            <Field label={t('home_currency')} for={fid('cur')}>
                <Input
                    id={fid('cur')}
                    value={currency}
                    maxlength={3}
                    class="uppercase"
                    oninput={(e) => (currency = e.currentTarget.value)}
                />
            </Field>
        </div>

        {#if travelerCount > 1 && cost.trim()}
            <Field label={t('cost_distribution')} for={fid('cost-dist')} hint="Select if this flight cost is the total or per person.">
                <Select
                    id={fid('cost-dist')}
                    value={costType}
                    onchange={(e) => (costType = e.currentTarget.value as 'total' | 'per_person')}
                >
                    <option value="total">{t('total_cost_split')}</option>
                    <option value="per_person">{t('per_person_cost')}</option>
                </Select>
            </Field>
        {/if}

        <Field label={t('notes')} for={fid('notes')}>
            <Textarea
                id={fid('notes')}
                value={notes}
                placeholder="Anything worth remembering..."
                oninput={(e) => (notes = e.currentTarget.value)}
            />
        </Field>

        {#if mode === 'edit' && flight}
            <AttachmentField
                {tripId}
                ownerType="flight"
                ownerId={flight._id}
                items={attachmentItems}
                label="Boarding passes & e-tickets"
                link={(attId) => flights.linkAttachment(flight._id, attId)}
                unlink={(attId) => flights.unlinkAttachment(flight._id, attId)}
                onchange={loadAttachments}
            />
        {:else}
            <p class="rounded-md bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
                Save the booking to attach boarding passes and e-tickets.
            </p>
        {/if}

        <!-- Legs -->
        <div class="flex flex-col gap-3">
            <h3 class="text-sm font-semibold text-ink">Legs</h3>
            {#each legs as leg, i (i)}
                <FlightLegFields
                    {leg}
                    index={i}
                    canRemove={legs.length > 1}
                    durationText={computed.segments[i]?.durationText ?? ''}
                    arrivalDayOffset={computed.segments[i]?.arrivalDayOffset ?? 0}
                    error={legErrors[i]}
                    onremove={() => removeLeg(i)}
                />
                {#if i < legs.length - 1}
                    {@const lay = computed.layovers[i]}
                    {@const warn = layoverWarnings[i]}
                    <div
                        class={`flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-xs ${warn ? 'bg-warning/10 text-warning' : 'bg-surface-sunken text-ink-muted'}`}
                    >
                        <ArrowRight class="size-3.5 shrink-0" />
                        <span class="font-medium">
                            Layover {endpointCode(leg.to)}
                            {lay?.text ? ` · ${lay.text}` : ''}
                            {#if lay?.changeAirport}<span>🔄 change airport</span>{/if}
                        </span>
                        {#if warn}<span class="inline-flex items-center gap-1"><AlertTriangle class="size-3.5" />{warn}</span>{/if}
                    </div>
                {/if}
            {/each}
            <Button variant="secondary" onclick={addLeg}>
                <Plus class="size-4" /> Add leg
            </Button>
        </div>

        {#if formError}
            <p class="flex items-center gap-2 text-sm text-danger" role="alert">
                <AlertTriangle class="size-4" />
                {formError}
            </p>
        {/if}

        {#if mode === 'edit'}
            <button
                type="button"
                onclick={remove}
                disabled={saving}
                class="mt-1 inline-flex items-center gap-2 self-start text-sm font-medium text-danger transition-colors hover:underline disabled:opacity-50 [&_svg]:size-4"
            >
                <Trash2 /> {t('delete')}
            </button>
        {/if}

        <button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
    </form>

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)} disabled={saving}>{t('cancel')}</Button>
        <Button onclick={save} disabled={saving}>
            <Plane class="size-4" />
            {saving ? t('saving') : mode === 'create' ? t('add_flight') : t('save_changes')}
        </Button>
    {/snippet}
</Sheet>
