<script lang="ts" module>
    let instanceCount = 0;
</script>

<script lang="ts">
    import { trips } from '$lib/db';
    import type { Trip } from '$lib/db';
    import { Button, Checkbox, Field, Input, Sheet, toast } from '$lib/components/ui';

    interface Props {
        open?: boolean;
        source?: Trip | null;
        /** Called with the newly created copy. */
        onsaved: (trip: Trip) => void;
    }

    let { open = $bindable(false), source = null, onsaved }: Props = $props();

    const uid = ++instanceCount;
    const fid = (s: string) => `dup-${s}-${uid}`;

    let title = $state('');
    let newStartDate = $state('');
    let saving = $state(false);
    let wasOpen = false;

    // Defaults mirror docs/06-page-home.md: checklist + itinerary on; bookings,
    // budget targets and expenses off.
    let opts = $state({
        checklist: true,
        itinerary: true,
        flights: false,
        reservations: false,
        budgetTargets: false,
        expenses: false
    });

    function initForm() {
        title = `${source?.title ?? 'Trip'} (copy)`;
        newStartDate = source?.startDate ?? '';
        opts = {
            checklist: true,
            itinerary: true,
            flights: false,
            reservations: false,
            budgetTargets: false,
            expenses: false
        };
    }

    $effect(() => {
        if (open && !wasOpen) initForm();
        wasOpen = open;
    });

    async function save() {
        if (!source) return;
        saving = true;
        try {
            const copy = await trips.duplicate(source._id, {
                title: title.trim() || undefined,
                newStartDate: newStartDate || undefined,
                checklist: opts.checklist,
                itinerary: opts.itinerary,
                flights: opts.flights,
                reservations: opts.reservations,
                budgetTargets: opts.budgetTargets,
                expenses: opts.expenses
            });
            open = false;
            onsaved?.(copy);
        } catch {
            toast.error('Could not duplicate the trip. Please try again.');
        } finally {
            saving = false;
        }
    }
</script>

<Sheet
    bind:open
    side="right"
    title="Duplicate trip"
    description={source?.title ? `Make a copy of "${source.title}".` : 'Make a copy of this trip.'}
>
    <div class="flex flex-col gap-4">
        <Field label="New trip name" for={fid('title')}>
            <Input
                id={fid('title')}
                value={title}
                oninput={(e) => (title = e.currentTarget.value)}
            />
        </Field>

        <Field label="Start date" for={fid('start')} hint="Dates shift to start here.">
            <Input
                id={fid('start')}
                type="date"
                value={newStartDate}
                oninput={(e) => (newStartDate = e.currentTarget.value)}
            />
        </Field>

        <fieldset class="flex flex-col gap-1 rounded-md border border-border p-3">
            <legend class="px-1 text-sm font-medium text-ink">What to copy</legend>

            <Checkbox
                label="Checklist"
                description="Copied and reset to unchecked."
                checked={opts.checklist}
                onchange={(e) => (opts.checklist = e.currentTarget.checked)}
            />

            <Checkbox
                label="Itinerary"
                description="Days and items, shifted to the new dates."
                checked={opts.itinerary}
                onchange={(e) => (opts.itinerary = e.currentTarget.checked)}
            />

            <Checkbox
                label="Flights"
                checked={opts.flights}
                onchange={(e) => (opts.flights = e.currentTarget.checked)}
            />

            <Checkbox
                label="Reservations"
                checked={opts.reservations}
                onchange={(e) => (opts.reservations = e.currentTarget.checked)}
            />

            <Checkbox
                label="Budget targets"
                checked={opts.budgetTargets}
                onchange={(e) => (opts.budgetTargets = e.currentTarget.checked)}
            />

            <Checkbox
                label="Expenses"
                checked={opts.expenses}
                onchange={(e) => (opts.expenses = e.currentTarget.checked)}
            />
        </fieldset>
    </div>

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)} disabled={saving}>Cancel</Button>
        <Button onclick={save} disabled={saving || !source}>
            {saving ? 'Duplicating...' : 'Duplicate'}
        </Button>
    {/snippet}
</Sheet>