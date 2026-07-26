<script lang="ts">
    import { checklist } from '$lib/db';
    import type { ChecklistTemplate } from '$lib/db';
    import { Badge, Button, Dialog, Field, Select, toast } from '$lib/components/ui';
    import { cn } from '$lib/utils';
    import { Briefcase, CheckCircle2, Compass, Layers, Luggage, Sparkles, Sun, Snowflake, Star } from 'lucide-svelte';

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
    let previewOpen = $state(true);
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

    const selectedTemplate = $derived(templates.find((t) => t._id === selectedId));

    const groupedItems = $derived.by(() => {
        if (!selectedTemplate?.items) return [];
        const map = new Map<string, typeof selectedTemplate.items>();
        for (const item of selectedTemplate.items) {
            const g = item.group ?? 'Packing';
            (map.get(g) ?? map.set(g, []).get(g)!).push(item);
        }
        return [...map.entries()].map(([group, items]) => ({ group, items }));
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
            'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors text-left cursor-pointer',
            active
                ? 'border-primary-600 bg-primary-100/60 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
                : 'border-border bg-surface text-ink-muted hover:bg-surface-sunken'
        );
</script>

<Dialog bind:open title="Apply a template" description="Choose a pre-built or custom checklist template to start your list.">
    {#if loading}
        <div class="py-8 text-center text-sm text-ink-muted">Loading templates...</div>
    {:else if templates.length === 0}
        <p class="text-sm text-ink-muted">
            No templates available.
        </p>
    {:else}
        <div class="flex flex-col gap-4">
            <Field label="Select Template" for="apply-template">
                <Select
                    id="apply-template"
                    value={selectedId}
                    onchange={(e) => (selectedId = e.currentTarget.value)}
                >
                    <optgroup label="Built-in Templates">
                        {#each templates.filter((t) => t._id.startsWith('tpl:builtin:')) as tpl (tpl._id)}
                            <option value={tpl._id}>
                                {tpl.name ?? 'Untitled'} {tpl.isDefault ? ' (Default)' : ''} · {tpl.items?.length ?? 0} items
                            </option>
                        {/each}
                    </optgroup>
                    {#if templates.some((t) => !t._id.startsWith('tpl:builtin:'))}
                        <optgroup label="My Custom Templates">
                            {#each templates.filter((t) => !t._id.startsWith('tpl:builtin:')) as tpl (tpl._id)}
                                <option value={tpl._id}>
                                    {tpl.name ?? 'Untitled'} {tpl.isDefault ? ' (Default)' : ''} · {tpl.items?.length ?? 0} items
                                </option>
                            {/each}
                        </optgroup>
                    {/if}
                </Select>
            </Field>

            {#if selectedTemplate}
                <!-- Template Card / Info -->
                <div class="rounded-lg border border-border bg-surface-sunken p-3 text-sm">
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2">
                            <span class="font-semibold text-ink">{selectedTemplate.name}</span>
                            {#if selectedTemplate._id.startsWith('tpl:builtin:')}
                                <Badge variant="primary" class="gap-1">
                                    <Sparkles class="size-3" /> Built-in
                                </Badge>
                            {/if}
                            {#if selectedTemplate.isDefault}
                                <Badge variant="warning">Default</Badge>
                            {/if}
                        </div>
                        <span class="text-xs text-ink-muted tabular-nums">
                            {selectedTemplate.items?.length ?? 0} items in {groupedItems.length} groups
                        </span>
                    </div>

                    {#if (selectedTemplate as any).description}
                        <p class="mt-1.5 text-xs text-ink-muted">{(selectedTemplate as any).description}</p>
                    {/if}

                    <!-- Preview of groups and items -->
                    <div class="mt-3 max-h-48 overflow-y-auto rounded-md border border-border bg-surface p-2.5 space-y-2 text-xs">
                        {#each groupedItems as group (group.group)}
                            <div>
                                <div class="font-medium text-ink border-b border-border/40 pb-1 mb-1 flex items-center justify-between">
                                    <span>{group.group}</span>
                                    <span class="text-[10px] text-ink-muted">{group.items.length}</span>
                                </div>
                                <ul class="space-y-1 pl-1">
                                    {#each group.items as item (item.text)}
                                        <li class="flex items-center gap-1.5 text-ink-muted">
                                            <CheckCircle2 class="size-3 shrink-0 text-ink-muted/50" />
                                            <span class="truncate">{item.text}</span>
                                            {#if item.important}
                                                <Star class="size-2.5 shrink-0 text-accent-amber fill-accent-amber" />
                                            {/if}
                                            {#if item.quantity && item.quantity > 1}
                                                <span class="text-[10px] font-mono text-ink-muted">({item.quantity}x)</span>
                                            {/if}
                                        </li>
                                    {/each}
                                </ul>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            <fieldset class="flex flex-col gap-1.5">
                <legend class="text-sm font-medium text-ink">Application Strategy</legend>
                <div class="flex gap-2">
                    <button type="button" class={modeClass(mode === 'merge')} onclick={() => (mode = 'merge')}>
                        <div class="font-semibold">Merge</div>
                        <div class="text-xs text-ink-muted">Add items, skipping any duplicates</div>
                    </button>
                    <button
                        type="button"
                        class={modeClass(mode === 'replace')}
                        onclick={() => (mode = 'replace')}
                    >
                        <div class="font-semibold">Replace</div>
                        <div class="text-xs text-ink-muted">Clear current list first</div>
                    </button>
                </div>
            </fieldset>
        </div>
    {/if}

    {#snippet footer()}
        <Button variant="ghost" onclick={() => (open = false)} disabled={applying}>Cancel</Button>
        <Button onclick={apply} disabled={applying || loading || !selectedId}>
            {applying ? 'Applying...' : 'Apply Template'}
        </Button>
    {/snippet}
</Dialog>