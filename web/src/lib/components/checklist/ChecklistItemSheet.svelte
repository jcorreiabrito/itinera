<script lang="ts" module>
    let instanceCount = 0;
</script>

<script lang="ts">
    import { CHECKLIST_PRESET_GROUPS, checklist } from '$lib/db';
    import type { ChecklistItem } from '$lib/db';
    import { Button, Field, Input, Select, Sheet, Textarea, toast } from '$lib/components/ui';
    import { Trash2 } from 'lucide-svelte';
    import { DateTime } from 'luxon';

    interface Props {
        open?: boolean;
        mode?: 'create' | 'edit';
        /** Bare trip ULID. */
        tripId: string;
        item?: ChecklistItem | null;
        /** Default group for a new item. */
        defaultGroup?: string;
        /** Existing custom groups (merged with the presets in the picker). */
        groups?: string[];
        /** Trip days (ISO) for the optional day link. */
        dates?: string[];
        onsaved?: () => void;
    }

    let {
        open = $bindable(false),
        mode = 'create',
        tripId,
        item = null,
        defaultGroup = 'Packing',
        groups = [],
        dates = [],
        onsaved
    }: Props = $props();

    const uid = ++instanceCount;
    const fid = (s: string) => `chk-${s}-${uid}`;
    const NEW = '__new__';

    interface FormState {
        text: string;
        group: string;
        newGroup: string;
        note: string;
        dueDate: string;
        date: string;
        quantity: string;
        important: boolean;
    }

    let form = $state<FormState>(blankForm());
    let errors = $state<Partial<Record<keyof FormState, string>>>({});
    let saving = $state(false);
    let wasOpen = false;

    const groupOptions = $derived(
        Array.from(new Set([...CHECKLIST_PRESET_GROUPS, ...groups])).filter(Boolean)
    );

    function blankForm(): FormState {
        return {
            text: '',
            group: defaultGroup,
            newGroup: '',
            note: '',
            dueDate: '',
            date: '',
            quantity: '',
            important: false
        };
    }

    function initForm() {
        errors = {};
        if (mode === 'edit' && item) {
            form = {
                text: item.text ?? '',
                group: item.group ?? 'Packing',
                newGroup: '',
                note: item.note ?? '',
                dueDate: item.dueDate ?? '',
                date: item.date ?? '',
                quantity: item.quantity != null ? String(item.quantity) : '',
                important: item.important ?? false
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

    function validate(): boolean {
        const e: Partial<Record<keyof FormState, string>> = {};
        if (!form.text.trim()) e.text = 'Add some text.';
        if (form.group === NEW && !form.newGroup.trim()) e.newGroup = 'Name the new group.';
        if (form.quantity.trim()) {
            const n = Number(form.quantity);
            if (!Number.isInteger(n) || n < 1) e.quantity = 'Enter a whole number (1 or more).';
        }
        errors = e;
        return Object.keys(e).length === 0;
    }

    async function save() {
        if (!validate()) return;
        saving = true;
        const group = form.group === NEW ? form.newGroup.trim() : form.group;
        const patch: checklist.NewChecklistItemInput = {
            text: form.text.trim(),
            group,
            note: form.note.trim() || undefined,
            dueDate: form.dueDate || null,
            date: form.date || null,
            quantity: form.quantity.trim() ? Number(form.quantity) : undefined,
            important: form.important
        };
        try {
            if (mode === 'create') await checklist.create(tripId, patch);
            else if (item) await checklist.update(item._id, patch);
            open = false;
            onsaved?.();
        } catch {
            toast.error('Could not save the item. Your changes are still here – try again.');
        } finally {
            saving = false;
        }
    }

    async function remove() {
        if (!item) return;
        const id = item._id;
        saving = true;
        try {
            await checklist.softDelete(id);
            open = false;
            toast.success('Item removed.', {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await checklist.restore(id);
                            onsaved?.();
                        } catch {
                            toast.error('Could not undo. Try restoring from Trash.');
                        }
                    }
                }
            });
            onsaved?.();
        } catch {
            toast.error('Could not remove the item. Try again.');
        } finally {
            saving = false;
        }
    }
</script>

<Sheet
    bind:open
    side="right"
    title={mode === 'create' ? 'Add item' : 'Edit item'}
    description={mode === 'create' ? 'Everything except the text is optional.' : undefined}
>
    <form
        class="flex flex-col gap-4"
        onsubmit={(e) => {
            e.preventDefault();
            save();
        }}
    >
        <Field label="Item" for={fid('text')} required error={errors.text}>
            <Input
                id={fid('text')}
                value={form.text}
                placeholder="e.g. Travel insurance"
                invalid={!!errors.text}
                oninput={(e) => (form.text = e.currentTarget.value)}
            />
        </Field>

        <Field label="Group" for={fid('group')}>
            <Select
                id={fid('group')}
                value={form.group}
                onchange={(e) => (form.group = e.currentTarget.value)}
            >
                {#each groupOptions as g (g)}
                    <option value={g}>{g}</option>
                {/each}
                <option value={NEW}>+ New group...</option>
            </Select>
        </Field>

        {#if form.group === NEW}
            <Field label="New group name" for={fid('newgroup')} error={errors.newGroup}>
                <Input
                    id={fid('newgroup')}
                    value={form.newGroup}
                    placeholder="e.g. Beach gear"
                    invalid={!!errors.newGroup}
                    oninput={(e) => (form.newGroup = e.currentTarget.value)}
                />
            </Field>
        {/if}

        <label class="flex items-center gap-3 text-sm">
            <input
                type="checkbox"
                checked={form.important}
                class="size-5 rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30"
                onchange={(e) => (form.important = e.currentTarget.checked)}
            />
            <span class="font-medium text-ink">Important (sorts to the top)</span>
        </label>

        <div class="grid grid-cols-2 gap-3">
            <Field label="Quantity" for={fid('qty')} error={errors.quantity}>
                <Input
                    id={fid('qty')}
                    type="number"
                    inputmode="numeric"
                    min={1}
                    step={1}
                    value={form.quantity}
                    placeholder="1"
                    invalid={!!errors.quantity}
                    oninput={(e) => (form.quantity = e.currentTarget.value)}
                />
            </Field>
            <Field label="Due date" for={fid('due')}>
                <Input
                    id={fid('due')}
                    type="date"
                    value={form.dueDate}
                    oninput={(e) => (form.dueDate = e.currentTarget.value)}
                />
            </Field>
        </div>

        <Field label="Link to a day" for={fid('day')} hint="Shows as a daily to-do on the itinerary.">
            <Select id={fid('day')} value={form.date} onchange={(e) => (form.date = e.currentTarget.value)}>
                <option value="">No day</option>
                {#each dates as d (d)}
                    <option value={d}>{dayLabel(d)}</option>
                {/each}
            </Select>
        </Field>

        <Field label="Note" for={fid('note')}>
            <Textarea
                id={fid('note')}
                rows={3}
                value={form.note}
                placeholder="Anything worth remembering..."
                oninput={(e) => (form.note = e.currentTarget.value)}
            />
        </Field>

        {#if mode === 'edit'}
            <button
                type="button"
                onclick={remove}
                disabled={saving}
                class="mt-1 inline-flex items-center gap-2 self-start text-sm font-medium text-danger transition-opacity hover:opacity-80 disabled:opacity-50"
            >
                <Trash2 />
                Delete item
            </button>
        {/if}

        <button type="submit" class="hidden" aria-hidden="true" tabindex="-1"></button>
    </form>

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)} disabled={saving}>Cancel</Button>
        <Button onclick={save} disabled={saving}>
            {saving ? 'Saving...' : mode === 'create' ? 'Add item' : 'Save changes'}
        </Button>
    {/snippet}
</Sheet>