<script lang="ts" module>
    let instanceCount = 0;
</script>

<script lang="ts">
    import { onMount } from 'svelte';
    import { bareTripUlid, checklist, trips } from '$lib/db';
    import type { ChecklistTemplate, Trip } from '$lib/db';
    import { ClipboardList, Copy, PenLine } from 'lucide-svelte';
    import { Button, Field, Input, Select, Sheet, toast } from '$lib/components/ui';

    interface Props {
        open?: boolean;
        /** Default home currency for new trips (from settings). */
        defaultCurrency?: string;
        /** Existing trips offered as duplicate sources. */
        sources?: Trip[];
        /** Called with the created trip after a Blank / template create. */
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

    type Step = 'choose' | 'blank' | 'template' | 'duplicate';

    let step = $state<Step>('choose');
    let saving = $state(false);
    let wasOpen = false;

    let templates = $state<ChecklistTemplate[]>([]);
    let templateId = $state('');
    let sourceId = $state('');

    interface FormState {
        title: string;
        startDate: string;
        endDate: string;
        destination: string;
        homeCurrency: string;
    }

    let form = $state<FormState>(blankForm());
    let errors = $state<Partial<Record<keyof FormState, string>>>({});

    function blankForm(): FormState {
        return {
            title: '',
            startDate: '',
            endDate: '',
            destination: '',
            homeCurrency: defaultCurrency || 'EUR'
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
        errors = e;
        return Object.keys(e).length === 0;
    }

    async function create() {
        if (!validate()) return;
        saving = true;
        try {
            const created = await trips.create({
                title: form.title.trim(),
                startDate: form.startDate,
                endDate: form.endDate,
                homeCurrency: form.homeCurrency,
                destinations: form.destination.trim() ? [{ name: form.destination.trim() }] : []
            });
            // Apply a checklist template (chosen one in template mode, otherwise the
            // default). Idempotent and best-effort, so it stays offline-safe and a
            // template hiccup never blocks the new trip.
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

    const choices = $derived(
        [
            { id: 'blank', icon: PenLine, label: 'Blank trip', desc: 'Start fresh with the essentials.' },
            {
                id: 'duplicate',
                icon: Copy,
                label: 'Duplicate a trip',
                desc: hasSources ? 'Copy an existing trip and shift the dates.' : 'No trips to copy yet.',
                disabled: !hasSources
            },
            {
                id: 'template',
                icon: ClipboardList,
                label: 'From a template',
                desc: hasTemplates ? 'Prefill the checklist from a saved template.' : 'No templates saved yet.',
                disabled: !hasTemplates
            }
        ]);

    const sheetTitle = $derived(
        step === 'choose'
            ? 'New trip'
            : step === 'duplicate'
              ? 'Duplicate a trip'
              : step === 'template'
                ? 'New trip from a template'
                : 'New trip'
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
            <Field label="Trip to copy" for={fid('source')}>
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
    {:else}
        <form
            class="flex flex-col gap-4"
            onsubmit={(e) => {
                e.preventDefault();
                create();
            }}
        >
            <Field label="Trip name" for={fid('title')} required error={errors.title}>
                <Input
                    id={fid('title')}
                    value={form.title}
                    placeholder="e.g. Rome & Florence"
                    invalid={!!errors.title}
                    oninput={(e) => (form.title = e.currentTarget.value)}
                />
            </Field>

            <div class="grid grid-cols-2 gap-3">
                <Field label="Start" for={fid('start')} required error={errors.startDate}>
                    <Input
                        id={fid('start')}
                        type="date"
                        value={form.startDate}
                        invalid={!!errors.startDate}
                        oninput={(e) => (form.startDate = e.currentTarget.value)}
                    />
                </Field>
                <Field label="End" for={fid('end')} required error={errors.endDate}>
                    <Input
                        id={fid('end')}
                        type="date"
                        value={form.endDate}
                        invalid={!!errors.endDate}
                        oninput={(e) => (form.endDate = e.currentTarget.value)}
                    />
                </Field>
            </div>

            <Field label="Destination" for={fid('dest')} hint="Optional – you can add more later.">
                <Input
                    id={fid('dest')}
                    value={form.destination}
                    placeholder="e.g. Rome"
                    oninput={(e) => (form.destination = e.currentTarget.value)}
                />
            </Field>

            <Field label="Home currency" for={fid('cur')}>
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

            {#if step === 'template'}
                <Field label="Checklist template" for={fid('tpl')} hint="Its items are added to your new checklist.">
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
            <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
        {:else if step === 'duplicate'}
            <Button variant="ghost" onclick={() => (step = 'choose')}>Back</Button>
            <Button onclick={continueDuplicate} disabled={!sourceId}>Continue</Button>
        {:else}
            <Button variant="ghost" onclick={() => (step = 'choose')} disabled={saving}>Back</Button>
            <Button onclick={create} disabled={saving}>
                {saving ? 'Creating...' : 'Create trip'}
            </Button>
        {/if}
    {/snippet}
</Sheet>