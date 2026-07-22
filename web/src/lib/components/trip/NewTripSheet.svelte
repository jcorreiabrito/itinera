<script lang="ts" module>
    let instanceCount = 0;
</script>

<script lang="ts">
    import { onMount } from 'svelte';
    import { bareTripUlid, checklist, trips } from '$lib/db';
    import type { ChecklistTemplate, Destination, Trip } from '$lib/db';
    import { ClipboardList, Copy, PenLine, Upload } from 'lucide-svelte';
    import { Button, Field, Input, Select, Sheet, toast } from '$lib/components/ui';
    import { t } from '$lib/i18n.svelte';
    import { importTripJson } from '$lib/api';
    import { importTripToLocalDb } from '$lib/db/importer';
    import DestinationListEditor from './DestinationListEditor.svelte';

    interface Props {
        open?: boolean;
        /** Default home currency for new trips (from settings). */
        defaultCurrency?: string;
        /** Existing trips offered as duplicate sources. */
        sources?: Trip[];
        /** Called with the created trip after a Blank / template create or import. */
        onsaved: (trip: Trip) => void;
        /** Called when the user chose "Duplicate a trip" and picked a source. */
        onduplicate: (source: Trip) => void;
    }

    let {
        open = $bindable(false),
        defaultCurrency = 'EUR',
        sources = [],
        onsaved,
        onduplicate
    }: Props = $props();

    const uid = ++instanceCount;
    const fid = (s: string) => `new-${s}-${uid}`;

    const CURRENCIES = [
        'EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF',
        'MXN', 'BRL', 'CLP', 'THB', 'SGD', 'INR', 'AED', 'ZAR'
    ];

    type Step = 'choose' | 'blank' | 'template' | 'duplicate' | 'import';

    let step = $state<Step>('choose');
    let saving = $state(false);
    let importing = $state(false);
    let wasOpen = false;

    let templates = $state<ChecklistTemplate[]>([]);
    let templateId = $state('');
    let sourceId = $state('');
    let importFile = $state<File | null>(null);
    let fileInputRef = $state<HTMLInputElement | null>(null);

    interface FormState {
        title: string;
        startDate: string;
        endDate: string;
        destinations: Destination[];
        homeCurrency: string;
        stage: 'planning' | 'confirmed';
        travelerCount: string;
    }

    let form = $state<FormState>(blankForm());
    let errors = $state<Partial<Record<keyof FormState, string>>>({});

    function blankForm(): FormState {
        return {
            title: '',
            startDate: '',
            endDate: '',
            destinations: [],
            homeCurrency: defaultCurrency || 'EUR',
            stage: 'planning',
            travelerCount: '1'
        };
    }

    async function loadTemplates() {
        try {
            templates = await checklist.templates.list();
            const def = await checklist.templates.getDefault();
            templateId = def?._id ?? templates[0]?._id ?? '';
        } catch {
            templates = [];
        }
    }

    function reset() {
        step = 'choose';
        errors = {};
        form = blankForm();
        sourceId = sources[0]?._id ?? '';
        importFile = null;
        void loadTemplates();
    }

    $effect(() => {
        if (open && !wasOpen) reset();
        wasOpen = open;
    });

    const currencyOptions = $derived(
        CURRENCIES.includes(form.homeCurrency) ? CURRENCIES : [form.homeCurrency, ...CURRENCIES]
    );

    const hasTemplates = $derived(templates.length > 0);
    const hasSources = $derived(sources.length > 0);

    function validate(): boolean {
        const e: Partial<Record<keyof FormState, string>> = {};
        if (!form.title.trim()) e.title = 'Give your trip a name.';
        if (!form.startDate) e.startDate = 'Pick a start date.';
        if (!form.endDate) e.endDate = 'Pick an end date.';
        if (form.startDate && form.endDate && form.endDate < form.startDate) {
            e.endDate = 'End date is before the start date.';
        }
        if (form.travelerCount.trim()) {
            const n = Number(form.travelerCount);
            if (!Number.isInteger(n) || n < 1) {
                e.travelerCount = 'Enter a valid number of travelers.';
            }
        }
        errors = e;
        return Object.keys(e).length === 0;
    }

    async function create() {
        if (!validate()) return;
        saving = true;
        try {
            const cleanDestinations = (form.destinations ?? []).filter((d) => d.name && d.name.trim().length > 0);
            const created = await trips.create({
                title: form.title.trim(),
                startDate: form.startDate,
                endDate: form.endDate,
                homeCurrency: form.homeCurrency,
                stage: form.stage,
                destinations: cleanDestinations,
                travelerCount: form.travelerCount.trim() ? Number(form.travelerCount) : 1
            });
            const tplId =
                step === 'template' ? templateId : ((await checklist.templates.getDefault())?._id ?? '');
            if (tplId) {
                try {
                    await checklist.applyTemplate(bareTripUlid(created._id), tplId, 'merge');
                } catch {
                    toast.warning('Trip created, but the checklist template could not be applied.');
                }
            }
            open = false;
            onsaved?.(created);
        } catch {
            toast.error('Could not create the trip. Your details are still here – try again.');
        } finally {
            saving = false;
        }
    }

    function continueDuplicate() {
        const source = sources.find((t) => t._id === sourceId);
        if (!source) return;
        open = false;
        onduplicate?.(source);
    }

    async function executeImport() {
        if (!importFile) return;
        importing = true;
        try {
            const text = await importFile.text();
            const payload = JSON.parse(text);

            // Write directly to local PouchDB. PouchDB's live sync automatically replicates to CouchDB
            const res = await importTripToLocalDb(payload);

            toast.success(t('import_success'));
            open = false;
            onsaved?.(res.trip);
        } catch (err: any) {
            toast.error(err?.message || t('import_invalid_file'));
        } finally {
            importing = false;
        }
    }

    function downloadTemplate() {
        const today = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const fmt = (d: Date) =>
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const start = new Date(today);
        start.setDate(today.getDate() + 30);
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        const startStr = fmt(start);
        const endStr = fmt(end);
        const dayStr = fmt(new Date(start.getTime() + 86400000));

        const template = {
            schema: 'itinera.trip-export',
            version: 1,
            exportedAt: new Date().toISOString(),
            db: 'itinera',
            tripId: 'trip:TEMPLATE',
            trip: {
                _id: 'trip:TEMPLATE',
                type: 'trip',
                title: 'My Trip to Paris',
                startDate: startStr,
                endDate: endStr,
                homeCurrency: defaultCurrency || 'EUR',
                primaryTimezone: 'Europe/Paris',
                destinations: [
                    { name: 'Paris', country: 'France', lat: 48.8566, lng: 2.3522, arriveDate: startStr, departDate: endStr }
                ],
                budget: { total: 2000, byCategory: { transport: 400, lodging: 800, food: 400, activities: 300, other: 100 } },
                tags: ['europe', 'city'],
                notes: 'Fill in your trip details here.',
                archived: false
            },
            documents: {
                tripDay: [
                    {
                        _id: `day:TEMPLATE:${dayStr}`,
                        type: 'tripDay',
                        tripId: 'trip:TEMPLATE',
                        date: dayStr,
                        title: 'Explore the City',
                        notes: 'Optional notes for this day.'
                    }
                ],
                itineraryItem: [
                    {
                        _id: 'itin:TEMPLATE:ITEM1',
                        type: 'itineraryItem',
                        tripId: 'trip:TEMPLATE',
                        date: dayStr,
                        allDay: false,
                        startTime: '10:00',
                        endTime: '12:00',
                        title: 'Visit the Eiffel Tower',
                        category: 'sightseeing',
                        location: { name: 'Eiffel Tower', address: 'Champ de Mars, 5 Av. Anatole France, 75007 Paris', lat: 48.8584, lng: 2.2945 },
                        notes: 'Book tickets in advance.',
                        estCost: 30,
                        currency: 'EUR'
                    }
                ],
                flight: [
                    {
                        _id: 'flt:TEMPLATE:FLT1',
                        type: 'flight',
                        tripId: 'trip:TEMPLATE',
                        bookingRef: 'ABC123',
                        checkInUrl: 'https://airline.com/checkin',
                        segments: [
                            {
                                airline: 'Air France',
                                flightNumber: 'AF1234',
                                from: { code: 'LIS', name: 'Humberto Delgado Airport', city: 'Lisbon', tz: 'Europe/Lisbon' },
                                to: { code: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', tz: 'Europe/Paris' },
                                departLocal: `${startStr}T08:00:00`,
                                arriveLocal: `${startStr}T11:00:00`,
                                seat: '14A',
                                terminal: '2E'
                            }
                        ],
                        cost: 180,
                        currency: 'EUR',
                        attachmentIds: []
                    }
                ],
                reservation: [
                    {
                        _id: 'res:TEMPLATE:RES1',
                        type: 'reservation',
                        tripId: 'trip:TEMPLATE',
                        kind: 'lodging',
                        name: 'Hotel de la Paix',
                        location: { name: 'Hotel de la Paix', address: '19 Rue de la Paix, 75002 Paris', lat: 48.8699, lng: 2.3318 },
                        start: `${startStr}T14:00:00`,
                        end: `${endStr}T12:00:00`,
                        confirmation: 'CONF-XYZ-789',
                        cost: 700,
                        currency: 'EUR',
                        contact: { phone: '+33 1 23 45 67 89', email: 'reception@hotel.com', url: 'https://hotel.com' },
                        notes: 'Non-smoking room on a high floor.',
                        attachmentIds: []
                    }
                ],
                expense: [
                    {
                        _id: 'exp:TEMPLATE:EXP1',
                        type: 'expense',
                        tripId: 'trip:TEMPLATE',
                        date: dayStr,
                        category: 'food',
                        description: 'Lunch at a bistro',
                        amountEstimate: 25,
                        amountActual: null,
                        currency: 'EUR',
                        paid: false
                    }
                ],
                checklistItem: [
                    {
                        _id: 'chk:TEMPLATE:CHK1',
                        type: 'checklistItem',
                        tripId: 'trip:TEMPLATE',
                        text: 'Pack passport',
                        group: 'Documents',
                        done: false,
                        important: true
                    },
                    {
                        _id: 'chk:TEMPLATE:CHK2',
                        type: 'checklistItem',
                        tripId: 'trip:TEMPLATE',
                        text: 'Buy travel insurance',
                        group: 'Documents',
                        done: false,
                        important: false
                    }
                ],
                attachment: []
            },
            counts: {
                tripDay: 1, itineraryItem: 1, flight: 1, reservation: 1,
                expense: 1, checklistItem: 2, attachment: 0
            },
            attachments: []
        };

        const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'itinera-template.json';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    const choices = $derived([
        { id: 'blank', icon: PenLine, label: t('blank_trip'), desc: 'Start fresh with the essentials.' },
        {
            id: 'duplicate',
            icon: Copy,
            label: t('duplicate_trip'),
            desc: hasSources ? 'Copy an existing trip and shift the dates.' : 'No trips to copy yet.',
            disabled: !hasSources
        },
        {
            id: 'template',
            icon: ClipboardList,
            label: t('from_template'),
            desc: hasTemplates ? 'Prefill the checklist from a saved template.' : 'No templates saved yet.',
            disabled: !hasTemplates
        },
        {
            id: 'import',
            icon: Upload,
            label: t('import_from_json'),
            desc: t('import_trip_desc')
        }
    ]);

    const sheetTitle = $derived(
        step === 'choose'
            ? t('new_trip')
            : step === 'duplicate'
              ? t('duplicate_trip')
              : step === 'template'
                ? t('from_template')
                : step === 'import'
                  ? t('import_from_json')
                  : t('new_trip')
    );
</script>

<Sheet
    bind:open
    side="right"
    title={sheetTitle}
    description={step === 'choose' ? 'How would you like to start?' : 'Just the essentials – add the rest later.'}
>
    {#if step === 'choose'}
        <div class="flex flex-col gap-3">
            {#each choices as choice (choice.id)}
                {@const Icon = choice.icon}
                <button
                    type="button"
                    disabled={choice.disabled}
                    onclick={() => (step = choice.id as Step)}
                    class="flex items-start gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary-600 hover:bg-primary-100/40 disabled:opacity-50 disabled:grayscale-[50%]"
                >
                    <span class="grid size-9 shrink-0 place-items-center rounded-md bg-primary-100 text-primary-700">
                        <Icon />
                    </span>
                    <span class="min-w-0">
                        <span class="block font-medium text-ink">{choice.label}</span>
                        <span class="block text-sm text-ink-muted">{choice.desc}</span>
                    </span>
                </button>
            {/each}
        </div>
    {:else if step === 'duplicate'}
        <div class="flex flex-col gap-4">
            <Field label={t('trip_to_copy')} for={fid('source')}>
                <Select id={fid('source')} value={sourceId} onchange={(e) => (sourceId = e.currentTarget.value)}>
                    {#each sources as t (t._id)}
                        <option value={t._id}>{t.title ?? 'Untitled'}</option>
                    {/each}
                </Select>
            </Field>
            <p class="text-sm text-ink-muted">
                You'll choose exactly what to copy on the next step.
            </p>
        </div>
    {:else if step === 'import'}
        <div class="flex flex-col gap-4">
            <input
                type="file"
                accept=".json,application/json"
                class="hidden"
                bind:this={fileInputRef}
                onchange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) importFile = file;
                }}
            />

            <button
                type="button"
                onclick={() => fileInputRef?.click()}
                ondragover={(e) => e.preventDefault()}
                ondrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer?.files?.[0];
                    if (file) importFile = file;
                }}
                class="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface p-8 text-center transition-colors hover:border-primary-600 hover:bg-primary-100/30"
            >
                <Upload class="size-8 text-primary-600" />
                <span class="text-sm font-medium text-ink">
                    {importFile ? importFile.name : t('import_drop_hint')}
                </span>
                {#if importFile}
                    <span class="text-xs text-ink-muted">
                        {(importFile.size / 1024).toFixed(1)} KB
                    </span>
                {/if}
            </button>

            <p class="text-center text-xs text-ink-muted">
                {t('import_no_json_yet')}
                <button
                    type="button"
                    onclick={downloadTemplate}
                    class="font-medium text-primary-600 underline-offset-2 hover:underline"
                >
                    {t('import_download_template')}
                </button>
            </p>
        </div>
    {:else}
        <form
            class="flex flex-col gap-4"
            onsubmit={(e) => {
                e.preventDefault();
                create();
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

            <DestinationListEditor
                bind:destinations={form.destinations}
                tripStartDate={form.startDate}
                tripEndDate={form.endDate}
            />

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

            <Field label={t('stage')} for={fid('stage')} hint={t('stage_hint')}>
                <Select
                    id={fid('stage')}
                    value={form.stage}
                    onchange={(e) => (form.stage = e.currentTarget.value as 'planning' | 'confirmed')}
                >
                    <option value="planning">{t('planning')}</option>
                    <option value="confirmed">{t('confirmed')}</option>
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

            {#if step === 'template'}
                <Field label={t('checklist_templates')} for={fid('tpl')} hint="Its items are added to your new checklist.">
                    <Select id={fid('tpl')} value={templateId} onchange={(e) => (templateId = e.currentTarget.value)}>
                        {#each templates as t (t._id)}
                            <option value={t._id}>{t.name ?? 'Untitled'} ({t.items?.length ?? 0})</option>
                        {/each}
                    </Select>
                </Field>
            {/if}

            <button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
        </form>
    {/if}

    {#snippet footer()}
        {#if step === 'choose'}
            <Button variant="ghost" onclick={() => (open = false)}>{t('cancel')}</Button>
        {:else if step === 'duplicate'}
            <Button variant="ghost" onclick={() => (step = 'choose')}>{t('back')}</Button>
            <Button onclick={continueDuplicate} disabled={!sourceId}>{t('continue')}</Button>
        {:else if step === 'import'}
            <Button variant="ghost" onclick={() => (step = 'choose')} disabled={importing}>{t('back')}</Button>
            <Button onclick={executeImport} disabled={!importFile || importing}>
                {importing ? t('importing') : t('import_trip')}
            </Button>
        {:else}
            <Button variant="ghost" onclick={() => (step = 'choose')} disabled={saving}>{t('back')}</Button>
            <Button onclick={create} disabled={saving}>
                {saving ? t('saving') : t('create_trip')}
            </Button>
        {/if}
    {/snippet}
</Sheet>