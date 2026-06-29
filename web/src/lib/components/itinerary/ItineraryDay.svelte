<script lang="ts">
    import { checklist, itinerary } from '$lib/db';
    import type { ChecklistItem, Flight, ItineraryItem, Reservation } from '$lib/db';
    import { ChevronDown, ListTodo, Pencil, Plus, Sparkles, Star } from 'lucide-svelte';
    import { DateTime } from 'luxon';
    import { Button, Dialog, Field, Input, Select, Textarea, toast } from '$lib/components/ui';
    import { formatMoney } from '$lib/format';
    import { renderMarkdown } from '$lib/markdown';
    import { cn } from '$lib/utils';
    import { CATEGORY_META, CATEGORY_ORDER } from './categories';
    import TimelineEntryRow from './TimelineEntryRow.svelte';
    import MoveToDayDialog from './MoveToDayDialog.svelte';

    interface Props {
        day: itinerary.DayTimeline;
        /** Bare trip ULID. */
        tripId: string;
        /** Trip days (ISO) for move-to-day. */
        dates: string[];
        homeCurrency?: string;
        flightsById?: Map<string, Flight>;
        reservationsById?: Map<string, Reservation>;
        links: { flights: string[]; reservations: string[] };
        /** Open the full edit sheet for an existing item. */
        onedit: (item: ItineraryItem) => void;
        /** Re-query after a mutation. */
        onchanged: () => void;
    }

    let {
        day,
        tripId,
        dates,
        homeCurrency = 'EUR',
        flightsById,
        reservationsById,
        links,
        onedit,
        onchanged
    }: Props = $props();

    const isIdeas = $derived(day.date === null);
    const heading = $derived(() => {
        if (!day.date) return 'Unscheduled · Ideas';
        const dt = DateTime.fromISO(day.date);
        return dt.isValid ? dt.toFormat('ccc d LLL') : day.date;
    });

    const todosDone = $derived(day.todos.filter((t) => t.done).length);
    let todosOpen = $state(true);

    // The merged timeline does not sort the all-day lane by `order` for dated days,
    // so sort it here to keep "move up/down" visibly consistent.
    const allDayItems = $derived(
        [...day.allDay].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    );

    // --- Day title + notes editor ----------------------------------------------
    let metaOpen = $state(false);
    let metaTitle = $state('');
    let metaNotes = $state('');
    let metaSaving = $state(false);

    function openMeta() {
        metaTitle = day.day?.title ?? '';
        metaNotes = day.day?.notes ?? '';
        metaOpen = true;
    }

    async function saveMeta() {
        if (!day.date) return;
        metaSaving = true;
        try {
            await itinerary.setDayMeta(tripId, day.date, {
                title: metaTitle.trim() || undefined,
                notes: metaNotes.trim() || undefined
            });
            metaOpen = false;
            onchanged();
        } catch {
            toast.error('Could not save the day details. Try again.');
        } finally {
            metaSaving = false;
        }
    }

    // --- Daily to-dos ----------------------------------------------------------
    async function toggleTodo(todo: ChecklistItem) {
        try {
            await checklist.toggle(todo._id);
            onchanged();
        } catch {
            toast.error('Could not update the to-do.');
        }
    }

    function todoLabel(todo: ChecklistItem): string {
        return `${todo.text ?? 'To-do'}, ${todo.done ? 'done' : 'not done'}`;
    }

    // --- Reorder (accessible move up/down) ------------------------------------
    function dayItemIds(): string[] {
        const ids: string[] = [];
        for (const id of allDayItems) ids.push(id._id);
        for (const id of day.timed) if (id.timed !== 'item' && e.item) ids.push(e.item._id);
        return ids;
    }

    function siblingIds(item: ItineraryItem): string[] {
        if (item.allDay) return allDayItems.map((i) => i._id);
        const items = day.timed
            .filter((e) => e.kind === 'item' && e.item)
            .map((e) => e.item as ItineraryItem);
        if (item.startTime) return items.filter((i) => i.startTime === item.startTime).map((i) => i._id);
        return items.filter((i) => i.startTime === item.startTime).map((i) => i._id);
    }

    function canMove(item: ItineraryItem, dir: 'up' | 'down'): boolean {
        const sib = siblingIds(item);
        const i = sib.indexOf(item._id);
        if (i < 0) return false;
        return dir === 'up' ? i > 0 : i < sib.length - 1;
    }

    async function move(item: ItineraryItem, dir: 'up' | 'down') {
        const sib = siblingIds(item);
        const i = sib.indexOf(item._id);
        const j = dir === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= sib.length) return;
        const all = dayItemIds();
        const ai = all.indexOf(sib[i]);
        const aj = all.indexOf(sib[j]);
        if (ai < 0 || aj < 0) return;
        [all[ai], all[aj]] = [all[aj], all[ai]];
        try {
            await itinerary.reorderWithinDay(all);
            onchanged();
        } catch {
            toast.error('Could not reorder. Try again.');
        }
    }

    // --- Move to day -----------------------------------------------------------
    let moveOpen = $state(false);
    let moveItem = $state<ItineraryItem | null>(null);

    function openMove(item: ItineraryItem) {
        moveItem = item;
        moveOpen = true;
    }

    async function doMoveDate(date: string | null) {
        if (!moveItem) return;
        try {
            await itinerary.moveToDay(moveItem._id, date);
            onchanged();
        } catch {
            toast.error('Could not move the activity. Try again.');
        }
    }

    // --- Add as expense / delete (from row menu) ------------------------------
    async function addExpense(item: ItineraryItem) {
        try {
            const exp = await itinerary.addExpense(item._id);
            if (exp) toast.success('Added to your costs.');
            else toast.error('Add an estimated cost first.');
            onchanged();
        } catch {
            toast.error('Could not add the expense. Try again.');
        }
    }

    async function removeItem(item: ItineraryItem) {
        try {
            await itinerary.softDelete(item._id);
            toast.success('Activity removed.', {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await itinerary.restore(item._id);
                            onchanged();
                        } catch {
                            toast.error('Could not undo. Try restoring from Trash.');
                        }
                    }
                }
            });
            onchanged();
        } catch {
            toast.error('Could not remove the activity. Try again.');
        }
    }

    // --- Quick add -------------------------------------------------------------
    let qTitle = $state('');
    let qAllDay = $state(false);
    let qTime = $state('');
    let qCategory = $state('');
    let qSaving = $state(false);

    async function quickAdd() {
        const title = qTitle.trim();
        if (!title) return;
        qSaving = true;
        try {
            await itinerary.create(tripId, {
                title,
                date: day.date,
                allDay: qAllDay,
                startTime: qAllDay ? undefined : qTime || undefined,
                category: qCategory ? (qCategory as ItineraryItem['category']) : undefined
            });
            qTitle = '';
            onchanged();
        } catch {
            toast.error('Could not add the activity. Try again.');
        } finally {
            qSaving = false;
        }
    }

    const isEmpty = $derived(day.allDay.length === 0 && day.timed.length === 0);
</script>

<section aria-label={heading} class="space-y-4">
    <!-- Day header -->
    <header class="flex items-start justify-between gap-3">
        <div class="min-w-0">
            <div class="flex items-center gap-2">
                {#if isIdeas}<Sparkles class="size-5 text-accent-terracotta" aria-hidden="true" />{/if}
                <h2 class="font-serif text-xl font-semibold text-ink">{heading}</h2>
            </div>
            {#if !isIdeas}
                {#if day.day?.title}
                    <p class="mt-0.5 text-sm font-medium text-primary-700">{day.day.title}</p>
                {/if}
                {#if day.day?.notes}
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="mt-1.5 space-y-1.5 text-sm text-ink-muted">{@html renderMarkdown(day.day.notes)}</div>
                {/if}
            {:else}
                <p class="mt-0.5 text-sm text-ink-muted">Capture ideas here, then move them onto a day.</p>
            {/if}
        </div>
        {#if !isIdeas}
            <button
                type="button"
                onclick={openMeta}
                class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [&_svg]:size-3.5"
            >
                <Pencil />
                {day.day?.title || day.day?.notes ? 'Edit day' : 'Add title'}
            </button>
        {/if}
    </header>

    <!-- Daily to-dos -->
    {#if !isIdeas && day.todos.length > 0}
        <div class="rounded-lg border border-border bg-surface-sunken">
            <button
                type="button"
                onclick={() => (todosOpen = !todosOpen)}
                aria-expanded={todosOpen}
                class="flex min-h-touch w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
            >
                <span class="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                    <ListTodo class="size-4 text-primary-700" />
                    Daily to-dos
                    <span class="text-ink-muted">({todosDone} of {day.todos.length} done)</span>
                </span>
                <ChevronDown class={cn('size-4 text-ink-muted transition-transform', todosOpen && '-rotate-180')} />
            </button>
            {#if todosOpen}
                <ul class="space-y-0.5 px-3 pb-2.5">
                    {#each day.todos as todo (todo._id)}
                        <li>
                            <label class="flex min-h-touch cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-surface">
                                <input
                                    type="checkbox"
                                    checked={todo.done}
                                    onchange={() => toggleTodo(todo)}
                                    aria-label={todoLabel(todo)}
                                    class="size-5 shrink-0 rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30"
                                />
                                <span class={cn('min-w-0 flex-1', todo.done && 'text-ink-muted line-through')}>
                                    {todo.text ?? 'To-do'}
                                </span>
                                {#if todo.important}
                                    <Star class="size-3.5 shrink-0 fill-accent-amber text-accent-amber" aria-label="Important" />
                                {/if}
                            </label>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/if}

    <!-- All-day lane -->
    {#if allDayItems.length > 0}
        <div>
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">All day</h3>
            <ul class="space-y-2">
                {#each allDayItems as item (item._id)}
                    <TimelineEntryRow
                        entry={{ kind: 'item', minutes: null, order: item.order ?? 0, item }}
                        {links}
                        {flightsById}
                        {reservationsById}
                        {homeCurrency}
                        canMoveUp={canMove(item, 'up')}
                        canMoveDown={canMove(item, 'down')}
                        {onedit}
                        onmoveup={(i) => move(i, 'up')}
                        onmovedown={(i) => move(i, 'down')}
                        onmovetoday={openMove}
                        onaddexpense={addExpense}
                        ondelete={removeItem}
                    />
                {/each}
            </ul>
        </div>
    {/if}

    <!-- Timed lane (ordered list = the timeline) -->
    {#if day.timed.length > 0}
        <ol
            class="relative space-y-2 before:absolute before:bottom-3 before:left-[4.75rem] before:top-3 before:w-px before:bg-border before:content-['']"
        >
            {#each day.timed as entry, i ({entry.item}_id ?? `${entry.kind}-${i}`)}
                <TimelineEntryRow
                    {entry}
                    {links}
                    {flightsById}
                    {reservationsById}
                    {homeCurrency}
                    canMoveUp={entry.item ? canMove(entry.item, 'up') : false}
                    canMoveDown={entry.item ? canMove(entry.item, 'down') : false}
                    {onedit}
                    onmoveup={(it) => move(it, 'up')}
                    onmovedown={(it) => move(it, 'down')}
                    onmovetoday={openMove}
                    onaddexpense={addExpense}
                    ondelete={removeItem}
                />
            {/each}
        </ol>
    {/if}

    {#if isEmpty}
        <div class="rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center">
            <p class="text-sm text-ink-muted">
                {isIdeas ? 'No ideas captured yet – jot one down below.' : 'Nothing planned – add something below.'}
            </p>
        </div>
    {/if}

    <!-- Day subtotal -->
    {#if !isIdeas}
        <div class="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">
            <span class="font-medium text-ink-muted">Day subtotal</span>
            {#if day.subtotal.spent > 0}
                <span class="font-semibold tabular-nums text-ink">{formatMoney(day.subtotal.spent, homeCurrency)}</span>
            {:else}
                <span class="text-ink-muted">No costs yet</span>
            {/if}
        </div>
        {#if day.subtotal.missingRateCount > 0}
            <p class="mt-2 text-xs text-warning">
                {day.subtotal.missingRateCount} cost{day.subtotal.missingRateCount === 1 ? '' : 's'} excluded – add an FX rate in Costs.
            </p>
        {/if}
    {/if}

    <!-- Quick add -->
    <form
        class="rounded-lg border border-border bg-surface p-3"
        onsubmit={(e) => {
            e.preventDefault();
            quickAdd();
        }}
    >
        <label for="quick-add-{tripId}" class="sr-only">Add an activity</label>
        <div class="flex items-center gap-2">
            <Input
                id="quick-add-{tripId}"
                class="flex-1"
                value={qTitle}
                placeholder={isIdeas ? 'Add an idea...' : 'Add an activity...'}
                oninput={(e) => (qTitle = e.currentTarget.value)}
            />
            <Button type="submit" size="sm" disabled={qSaving || !qTitle.trim()}>
                <Plus class="size-4" />
                Add
            </Button>
        </div>
        <div class="mt-2.5 flex flex-wrap items-center gap-1">
            <label class="inline-flex items-center gap-2 text-sm text-ink">
                <input
                    type="checkbox"
                    checked={qAllDay}
                    onchange={(e) => (qAllDay = e.currentTarget.checked)}
                    class="size-4 rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30"
                />
                All day
            </label>
            {#if !qAllDay}
                <label class="inline-flex items-center gap-2 text-sm text-ink-muted">
                    <span class="sr-only">Start time</span>
                    <input
                        type="time"
                        class="h-9 w-32"
                        value={qTime}
                        oninput={(e) => (qTime = e.currentTarget.value)}
                    />
                </label>
            {/if}
            <label class="inline-flex items-center gap-2 text-sm text-ink-muted">
                <span class="sr-only">Category</span>
                <Select
                    class="h-9 w-40"
                    value={qCategory}
                    onchange={(e) => (qCategory = e.currentTarget.value)}
                >
                    <option value="">No category</option>
                    {#each CATEGORY_ORDER as cat (cat)}
                        <option value={cat}>{CATEGORY_META[cat].label}</option>
                    {/each}
                </Select>
            </label>
        </div>
    </form>
</section>

<!-- Day details dialog -->
<Dialog bind:open={metaOpen} title="Day details" description={!isIdeas ? undefined : heading}>
    <div class="flex flex-col gap-4">
        <Field label="Title" for="day-title">
            <Input
                id="day-title"
                value={metaTitle}
                placeholder="e.g. Vatican day"
                oninput={(e) => (metaTitle = e.currentTarget.value)}
            />
        </Field>
        <Field label="Notes" for="day-notes" hint="Markdown supported.">
            <Textarea
                id="day-notes"
                rows={3}
                value={metaNotes}
                placeholder="Plans, reminders, links..."
                oninput={(e) => (metaNotes = e.currentTarget.value)}
            />
        </Field>
    </div>

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (metaOpen = false)} disabled={metaSaving}>Cancel</Button>
        <Button onclick={saveMeta} disabled={metaSaving}>{metaSaving ? 'Saving...' : 'Save'}</Button>
    {/snippet}
</Dialog>

<!-- Move to day dialog -->
<MoveToDayDialog
    bind:open={moveOpen}
    {dates}
    current={moveItem?.date ?? null}
    title={moveItem?.title}
    onmove={doMoveDate}
/>
