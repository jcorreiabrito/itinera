<script lang="ts">
    import { checklist } from '$lib/db';
    import type { ChecklistTemplate } from '$lib/db';
    import { Button, Dialog, Field, Select, toast } from '$lib/components/ui';
    import { cn } from '$lib/utils';

    interface Props {
        open?: boolean;
        /** Bare trip ULID. */
        tripId: string;
        onapplied?: () => void;
    }

    let { open = $bindable(false), tripId, onapplied }: Props = $props();

    let templates = $state<ChecklistTemplate[]>([]);
    let loading = $state(false);
    let applying = $state(false);
    let selectedId = $state('');
    let mode = $state<checklist.ApplyTemplateMode>('merge');
    let wasOpen = false;

    async function loadTemplates() {
        loading = true;
        try {
            const list = await checklist.templates.list();
            templates = list;
            const def = list.find((t) => t.isDefault);
            selectedId = def?._id ?? list[0]?._id ?? '';
        } catch {
            toast.error('Could not load templates.');
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        if (open && !wasOpen) loadTemplates();
        wasOpen = open;
    });

    async function apply() {
        if (!selectedId) return;
        applying = true;
        try {
            const added = await checklist.applyTemplate(tripId, selectedId, mode);
            open = false;
            toast.success(
                mode === 'replace'
                    ? 'Checklist replaced from template.'
                    : added > 0
                      ? `Added ${added} item${added === 1 ? '' : 's'}.`
                      : 'Already up to date – no new items.'
            );
            onapplied?.();
        } catch {
            toast.error('Could not apply the template. Try again.');
        } finally {
            applying = false;
        }
    }

    const modeClass = (active: boolean) =>
        cn(
            'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
            active
                ? 'border-primary-600 bg-primary-100 text-primary-700'
                : 'border-border bg-surface text-ink-muted hover:bg-surface-sunken'
        );
</script>

<Dialog bind:open title="Apply a template" description="Start from a reusable list.">
    {#if loading}
        <p class="text-sm text-ink-muted">Loading templates...</p>
    {:else if templates.length === 0}
        <p class="text-sm text-ink-muted">
            No templates yet. Build a list you like, then "Save as template" to reuse it on future trips.
        </p>
    {:else}
        <div class="flex flex-col gap-4">
            <Field label="Template" for="apply-template">
                <Select
                    id="apply-template"
                    value={selectedId}
                    onchange={(e) => (selectedId = e.currentTarget.value)}
                >
                    {#each templates as tpl (tpl._id)}
                        <option value={tpl._id}>
                            {tpl.name ?? 'Untitled'}{tpl.isDefault ? ' (default)' : ''} · {tpl.items?.length ?? 0} items
                        </option>
                    {/each}
                </Select>
            </Field>

            <fieldset class="flex flex-col gap-1.5">
                <legend class="text-sm font-medium text-ink">How to apply</legend>
                <div class="flex gap-2">
                    <button type="button" class={modeClass(mode === 'merge')} onclick={() => (mode = 'merge')}>
                        Merge
                    </button>
                    <button
                        type="button"
                        class={modeClass(mode === 'replace')}
                        onclick={() => (mode = 'replace')}
                    >
                        Replace
                    </button>
                </div>
                <p class="text-xs text-ink-muted">
                    {mode === 'merge'
                        ? 'Adds the template\'s items, skipping ones you already have.'
                        : 'Removes your current items first, then adds the template\'s.'}
                </p>
            </fieldset>
        </div>
    {/if}

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)} disabled={applying}>Cancel</Button>
        <Button onclick={apply} disabled={applying || loading || !selectedId}>
            {applying ? 'Applying...' : 'Apply'}
        </Button>
    {/snippet}
</Dialog>