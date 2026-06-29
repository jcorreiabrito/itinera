<script lang="ts" module>
    let instanceCount = 0;
</script>

<script lang="ts">
    import { nightsBetween, reservations } from '$lib/db';
    import type {
        Attachment,
        GeoLocation,
        Reservation,
        ReservationContact,
        ReservationDetails,
        ReservationKind
    } from '$lib/db';
    import { Button, Field, Input, Select, Sheet, Textarea, toast } from '$lib/components/ui';
    import { AttachmentField } from '$lib/components/attachments';
    import { Trash2 } from 'lucide-svelte';
    import { formatNights } from '$lib/format';
    import { KIND_META, KIND_ORDER, kindMeta } from './kinds';

    interface Props {
        open?: boolean;
        mode?: 'create' | 'edit';
        /** Bare trip ULID. */
        tripId: string;
        reservation?: Reservation | null;
        /** Pre-selected kind for a fresh reservation. */
        defaultKind?: ReservationKind;
        homeCurrency?: string;
        onsaved?: () => void;
    }

    let {
        open = $bindable(false),
        mode = 'create',
        tripId,
        reservation = null,
        defaultKind = 'lodging',
        homeCurrency = 'EUR',
        onsaved
    }: Props = $props();

    const uid = ++instanceCount;
    const fid = (s: string) => `res-${s}-${uid}`;

    interface FormState {
        kind: ReservationKind;
        name: string;
        startDate: string;
        startTime: string;
        endDate: string;
        endTime: string;
        locName: string;
        locAddress: string;
        lat: string;
        lng: string;
        confirmation: string;
        cost: string;
        currency: string;
        phone: string;
        email: string;
        website: string;
        notes: string;
        // Kind-specific details (flat; only the relevant ones are submitted)
        roomType: string;
        address2: string;
        pickupLocation: string;
        dropoffLocation: string;
        company: string;
        carClass: string;
        partySize: string;
        provider: string;
        meetingPoint: string;
        mode: string;
        transFrom: string;
        transTo: string;
        carrier: string;
        seat: string;
        coach: string;
    }

    let form = $state<FormState>(blankForm());
    let errors = $state<Partial<Record<keyof FormState, string>>>({});
    let saving = $state(false);
    let wasOpen = false;
    let attachmentItems = $state<Attachment[]>([]);

    function blankForm(): FormState {
        return {
            kind: defaultKind,
            name: '',
            startDate: '',
            startTime: '',
            endDate: '',
            endTime: '',
            locName: '',
            locAddress: '',
            lat: '',
            lng: '',
            confirmation: '',
            cost: '',
            currency: homeCurrency,
            phone: '',
            email: '',
            website: '',
            notes: '',
            roomType: '',
            address2: '',
            pickupLocation: '',
            dropoffLocation: '',
            company: '',
            carClass: '',
            partySize: '',
            provider: '',
            meetingPoint: '',
            mode: '',
            transFrom: '',
            transTo: '',
            carrier: '',
            seat: '',
            coach: ''
        };
    }

    function dateOfStr(value: string | null | undefined): string {
        return value ? value.slice(0, 10) : '';
    }

    function timeOfStr(value: string | null | undefined): string {
        if (!value) return '';
        const m = /^(\d{2}):(\d{2})/.exec(value);
        return m ? `${m[1]}:${m[2]}` : '';
    }

    function initForm() {
        errors = {};
        if (mode === 'edit' && reservation) {
            const d = (reservation.details ?? {}) as Record<string, unknown>;
            const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
            form = {
                kind: reservation.kind as ReservationKind ?? 'other',
                name: reservation.name ?? '',
                startDate: dateOfStr(reservation.start),
                startTime: timeOfStr(reservation.start),
                endDate: dateOfStr(reservation.end),
                endTime: timeOfStr(reservation.end),
                locName: reservation.location?.name ?? '',
                locAddress: reservation.location?.address ?? '',
                lat: reservation.location?.lat != null ? String(reservation.location.lat) : '',
                lng: reservation.location?.lng != null ? String(reservation.location.lng) : '',
                confirmation: reservation.confirmation ?? '',
                cost: reservation.cost != null ? String(reservation.cost) : '',
                currency: reservation.currency ?? homeCurrency,
                phone: reservation.contact?.phone ?? '',
                email: reservation.contact?.email ?? '',
                website: reservation.contact?.url ?? '',
                notes: reservation.notes ?? '',
                roomType: str('roomType'),
                address2: str('address2'),
                pickupLocation: str('pickupLocation'),
                dropoffLocation: str('dropoffLocation'),
                company: str('company'),
                carClass: str('carClass'),
                partySize: typeof d.partySize === 'number' ? String(d.partySize) : '',
                provider: str('provider'),
                meetingPoint: str('meetingPoint'),
                mode: str('mode'),
                transFrom: str('from'),
                transTo: str('to'),
                carrier: str('carrier'),
                seat: str('seat'),
                coach: str('coach')
            };
            void loadAttachments();
        } else {
            form = blankForm();
            attachmentItems = [];
        }
    }

    $effect(() => {
        if (open && !wasOpen) initForm();
        wasOpen = open;
    });

    async function loadAttachments() {
        if (!reservation) return;
        try {
            attachmentItems = await reservations.listAttachments(reservation._id);
        } catch {
            attachmentItems = [];
        }
    }

    const meta = $derived(kindMeta(form.kind));
    const showEnd = $derived(meta.endLabel != null);
    const nightsPreview = $derived(
        form.kind === 'lodging' && form.startDate && form.endDate
            ? nightsBetween(form.startDate, form.endDate)
            : 0
    );

    function combine(date: string, time: string): string {
        if (!date) return '';
        return time ? `${date}T${time}` : date;
    }

    function buildDetails(): ReservationDetails {
        const t = (v: string) => v.trim();
        const out: Record<string, unknown> = {};
        const put = (k: string, v: string) => {
            if (t(v)) out[k] = t(v);
        };
        switch (form.kind) {
            case 'lodging':
                put('roomType', form.roomType);
                put('address2', form.address2);
                break;
            case 'car':
                put('pickupLocation', form.pickupLocation);
                put('dropoffLocation', form.dropoffLocation);
                put('company', form.company);
                put('carClass', form.carClass);
                break;
            case 'restaurant':
                const n = Number(form.partySize);
                if (form.partySize.trim() && Number.isFinite(n) && n > 0) out.partySize = n;
                break;
            case 'activity':
                put('provider', form.provider);
                put('meetingPoint', form.meetingPoint);
                break;
            case 'transport':
                if (form.mode) out.mode = form.mode;
                put('from', form.transFrom);
                put('to', form.transTo);
                put('carrier', form.carrier);
                put('seat', form.seat);
                put('coach', form.coach);
                break;
        }
        return out as ReservationDetails;
    }

    function validate(): boolean {
        const e: Partial<Record<keyof FormState, string>> = {};
        if (!form.name.trim()) e.name = 'Give the reservation a name.';
        if (form.cost.trim()) {
            const n = Number(form.cost);
            if (!Number.isFinite(n) || n < 0) e.cost = 'Enter a valid amount.';
        }
        const start = combine(form.startDate, form.startTime);
        const end = combine(form.endDate, form.endTime);
        if (start && end && end < start) e.endDate = 'End is before the start.';
        errors = e;
        return Object.keys(e).length === 0;
    }

    function buildInput(): reservations.NewReservationInput {
        const start = combine(form.startDate, form.startTime);
        const end = showEnd ? combine(form.endDate, form.endTime) : '';
        const lat = form.lat.trim() ? Number(form.lat) : undefined;
        const lng = form.lng.trim() ? Number(form.lng) : undefined;
        const hasLocation = !!(form.locName.trim() || form.locAddress.trim() || lat != null || lng != null);
        const location: GeoLocation | undefined = hasLocation
            ? {
                  name: form.locName.trim() || undefined,
                  address: form.locAddress.trim() || undefined,
                  lat: Number.isFinite(lat) ? lat : undefined,
                  lng: Number.isFinite(lng) ? lng : undefined
              }
            : undefined;

        const hasContact = !!(form.phone.trim() || form.email.trim() || form.website.trim());
        const contact: ReservationContact | undefined = hasContact
            ? {
                  phone: form.phone.trim() || undefined,
                  email: form.email.trim() || undefined,
                  url: form.website.trim() || undefined
              }
            : undefined;

        const amount = form.cost.trim() ? Number(form.cost) : null;
        const validCost = amount != null && Number.isFinite(amount) && amount >= 0 ? amount : null;
        return {
            kind: form.kind,
            name: form.name.trim(),
            start: start || null,
            end: end || null,
            location,
            confirmation: form.confirmation.trim() || undefined,
            // Setting cost unserts a linked expense (category by kind) in the repo.
            cost: validCost,
            currency: validCost != null ? form.currency.trim().toUpperCase() || homeCurrency : undefined,
            contact,
            details: buildDetails(),
            notes: form.notes.trim() || undefined
        };
    }

    async function save() {
        if (!validate()) return;
        saving = true;
        try {
            const input = buildInput();
            if (mode === 'create') await reservations.create(tripId, input);
            else if (reservation) await reservations.update(reservation._id, input);
            open = false;
            onsaved?.();
        } catch {
            toast.error('Could not save the reservation. Your changes are still here – try again.');
        } finally {
            saving = false;
        }
    }

    async function remove() {
        if (!reservation) return;
        const id = reservation._id;
        saving = true;
        try {
            await reservations.softDelete(id);
            open = false;
            toast.success('Reservation removed.', {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await reservations.restore(id);
                            onsaved?.();
                        } catch {
                            toast.error('Could not undo. Try restoring from Trash.');
                        }
                    }
                }
            });
            onsaved?.();
        } catch {
            toast.error('Could not remove the reservation. Try again.');
        } finally {
            saving = false;
        }
    }
</script>

<Sheet
    bind:open
    side="right"
    title={mode === 'create' ? 'Add reservation' : 'Edit reservation'}
    description="Name and type get you a row fast – refine the details anytime."
>
    <form
        class="flex flex-col gap-4"
        onsubmit={(e) => {
            e.preventDefault();
            save();
        }}
    >
        <Field label="Type" for={fid('kind')}>
            <Select id={fid('kind')} value={form.kind} onchange={(e) => (form.kind = e.currentTarget.value as ReservationKind)}>
                {#each KIND_ORDER as k (k)}
                    <option value={k}>{KIND_META[k].label}</option>
                {/each}
            </Select>
        </Field>

        <Field label="Name" for={fid('name')} required error={errors.name}>
            <Input
                id={fid('name')}
                value={form.name}
                placeholder="e.g. Hotel Artemide"
                invalid={!!errors.name}
                oninput={(e) => (form.name = e.currentTarget.value)}
            />
        </Field>

        <!-- Start / End + date + optional time (no time = shows as all-day). -->
        <div class="grid grid-cols-[1fr_7rem] gap-3">
            <Field label={`${meta.startLabel} date`} for={fid('sd')}>
                <Input id={fid('sd')} type="date" value={form.startDate} oninput={(e) => (form.startDate = e.currentTarget.value)} />
            </Field>
            <Field label="Time" for={fid('st')}>
                <Input id={fid('st')} type="time" value={form.startTime} oninput={(e) => (form.startTime = e.currentTarget.value)} />
            </Field>
        </div>

        {#if showEnd}
            <div class="grid grid-cols-[1fr_7rem] gap-3">
                <Field label={`${meta.endLabel} date`} for={fid('ed')} error={errors.endDate}>
                    <Input id={fid('ed')} type="date" value={form.endDate} invalid={!!errors.endDate} oninput={(e) => (form.endDate = e.currentTarget.value)} />
                </Field>
                <Field label="Time" for={fid('et')}>
                    <Input id={fid('et')} type="time" value={form.endTime} oninput={(e) => (form.endTime = e.currentTarget.value)} />
                </Field>
            </div>
        {/if}

        {#if form.kind === 'lodging' && nightsPreview > 0}
            <p class="mt-2 text-xs text-ink-muted">{formatNights(nightsPreview)}</p>
        {/if}

        <!-- Tailored details per type -->
        {#if form.kind === 'lodging'}
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Room type" for={fid('room')}>
                    <Input id={fid('room')} value={form.roomType} placeholder="Double, sea view" oninput={(e) => (form.roomType = e.currentTarget.value)} />
                </Field>
                <Field label="Address line 2" for={fid('addr2')}>
                    <Input id={fid('addr2')} value={form.address2} placeholder="Floor / unit" oninput={(e) => (form.address2 = e.currentTarget.value)} />
                </Field>
            </div>
        {:else if form.kind === 'car'}
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Pick-up location" for={fid('pick')}>
                    <Input id={fid('pick')} value={form.pickupLocation} placeholder="Airport T1" oninput={(e) => (form.pickupLocation = e.currentTarget.value)} />
                </Field>
                <Field label="Drop-off location" for={fid('drop')}>
                    <Input id={fid('drop')} value={form.dropoffLocation} placeholder="City centre" oninput={(e) => (form.dropoffLocation = e.currentTarget.value)} />
                </Field>
                <Field label="Company" for={fid('company')}>
                    <Input id={fid('company')} value={form.company} placeholder="Hertz" oninput={(e) => (form.company = e.currentTarget.value)} />
                </Field>
                <Field label="Car class" for={fid('class')}>
                    <Input id={fid('class')} value={form.carClass} placeholder="Compact" oninput={(e) => (form.carClass = e.currentTarget.value)} />
                </Field>
            </div>
        {:else if form.kind === 'restaurant'}
            <Field label="Party size" for={fid('party')}>
                <Input id={fid('party')} type="number" inputmode="numeric" min={1} value={form.partySize} placeholder="2" oninput={(e) => (form.partySize = e.currentTarget.value)} />
            </Field>
        {:else if form.kind === 'activity'}
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Provider" for={fid('prov')}>
                    <Input id={fid('prov')} value={form.provider} placeholder="GetYourGuide" oninput={(e) => (form.provider = e.currentTarget.value)} />
                </Field>
                <Field label="Meeting point" for={fid('meet')}>
                    <Input id={fid('meet')} value={form.meetingPoint} placeholder="Main entrance" oninput={(e) => (form.meetingPoint = e.currentTarget.value)} />
                </Field>
            </div>
        {:else if form.kind === 'transport'}
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Mode" for={fid('mode')}>
                    <Select id={fid('mode')} value={form.mode} onchange={(e) => (form.mode = e.currentTarget.value)}>
                        <option value="">Choose...</option>
                        <option value="train">Train</option>
                        <option value="bus">Bus</option>
                        <option value="ferry">Ferry</option>
                        <option value="transfer">Transfer</option>
                    </Select>
                </Field>
                <Field label="Carrier" for={fid('carrier')}>
                    <Input id={fid('carrier')} value={form.carrier} placeholder="Trenitalia" oninput={(e) => (form.carrier = e.currentTarget.value)} />
                </Field>
                <Field label="From" for={fid('from')}>
                    <Input id={fid('from')} value={form.transFrom} placeholder="Roma Termini" oninput={(e) => (form.transFrom = e.currentTarget.value)} />
                </Field>
                <Field label="To" for={fid('to')}>
                    <Input id={fid('to')} value={form.transTo} placeholder="Firenze SMN" oninput={(e) => (form.transTo = e.currentTarget.value)} />
                </Field>
                <Field label="Seat" for={fid('tseat')}>
                    <Input id={fid('tseat')} value={form.seat} placeholder="12A" oninput={(e) => (form.seat = e.currentTarget.value)} />
                </Field>
                <Field label="Coach" for={fid('coach')}>
                    <Input id={fid('coach')} value={form.coach} placeholder="7" oninput={(e) => (form.coach = e.currentTarget.value)} />
                </Field>
            </div>
        {/if}

        <!-- Location -->
        <Field label="Location name" for={fid('locname')}>
            <Input id={fid('locname')} value={form.locName} placeholder="Where it is" oninput={(e) => (form.locName = e.currentTarget.value)} />
        </Field>
        <Field label="Address" for={fid('locaddr')}>
            <Input id={fid('locaddr')} value={form.locAddress} placeholder="Street, city" oninput={(e) => (form.locAddress = e.currentTarget.value)} />
        </Field>
        <div class="grid grid-cols-2 gap-3">
            <Field label="Latitude" for={fid('lat')}>
                <Input id={fid('lat')} type="number" inputmode="decimal" step="any" value={form.lat} placeholder="41.902" oninput={(e) => (form.lat = e.currentTarget.value)} />
            </Field>
            <Field label="Longitude" for={fid('lng')}>
                <Input id={fid('lng')} type="number" inputmode="decimal" step="any" value={form.lng} placeholder="12.495" oninput={(e) => (form.lng = e.currentTarget.value)} />
            </Field>
        </div>

        <Field label="Confirmation code" for={fid('conf')}>
            <Input id={fid('conf')} value={form.confirmation} placeholder="ABC123" oninput={(e) => (form.confirmation = e.currentTarget.value)} />
        </Field>

        <div class="grid grid-cols-[1fr_7rem] gap-3">
            <Field label="Cost" for={fid('cost')} error={errors.cost} hint="Adds one linked expense to your budget.">
                <Input id={fid('cost')} type="number" inputmode="decimal" min={0} value={form.cost} placeholder="340" invalid={!!errors.cost} oninput={(e) => (form.cost = e.currentTarget.value)} />
            </Field>
            <Field label="Currency" for={fid('cur')}>
                <Input id={fid('cur')} value={form.currency} maxlength={3} class="uppercase" oninput={(e) => (form.currency = e.currentTarget.value)} />
            </Field>
        </div>

        <!-- Contact -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Phone" for={fid('phone')}>
                <Input id={fid('phone')} type="tel" value={form.phone} placeholder="+39 ..." oninput={(e) => (form.phone = e.currentTarget.value)} />
            </Field>
            <Field label="Email" for={fid('email')}>
                <Input id={fid('email')} type="email" value={form.email} placeholder="hotel@example.com" oninput={(e) => (form.email = e.currentTarget.value)} />
            </Field>
        </div>
        <Field label="Website" for={fid('web')}>
            <Input id={fid('web')} type="url" value={form.website} placeholder="https://..." oninput={(e) => (form.website = e.currentTarget.value)} />
        </Field>

        <Field label="Notes" for={fid('notes')}>
            <Textarea id={fid('notes')} rows={2} value={form.notes} placeholder="Anything worth remembering..." oninput={(e) => (form.notes = e.currentTarget.value)} />
        </Field>

        {#if mode === 'edit' && reservation}
            <AttachmentField
                {tripId}
                ownerType="reservation"
                ownerId={reservation._id}
                items={attachmentItems}
                label="Vouchers & confirmations"
                link={(attId) => reservations.linkAttachment(reservation._id, attId)}
                unlink={(attId) => reservations.unlinkAttachment(reservation._id, attId)}
                onchange={loadAttachments}
            />
        {:else}
            <p class="rounded-md bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
                Save the reservation to attach vouchers and confirmations.
            </p>
        {/if}

        {#if mode === 'edit'}
            <button
                type="button"
                onclick={remove}
                disabled={saving}
                class="mt-1 inline-flex items-center gap-2 self-start text-sm font-medium text-danger transition-colors hover:underline disabled:opacity-50 [&_svg]:size-4"
            >
                <Trash2 /> Delete reservation
            </button>
        {/if}

        <button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
    </form>

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)} disabled={saving}>Cancel</Button>
        <Button onclick={save} disabled={saving}>
            {saving ? 'Saving...' : mode === 'create' ? 'Add reservation' : 'Save changes'}
        </Button>
    {/snippet}
</Sheet>
