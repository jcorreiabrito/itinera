<script lang="ts">
  import type { Destination } from '$lib/db';
  import { ensureDestinationId } from '$lib/destinations';
  import { ArrowDown, ArrowUp, MapPin, Plus, Trash2 } from 'lucide-svelte';
  import { Button, Field, Input } from '$lib/components/ui';
  import { t } from '$lib/i18n.svelte';

  interface Props {
    destinations: Destination[];
    tripStartDate?: string;
    tripEndDate?: string;
    onChange?: (destinations: Destination[]) => void;
  }

  let { destinations = $bindable([]), tripStartDate, tripEndDate, onChange }: Props = $props();

  // Ensure every destination item has a stable local id for rendering
  let items = $state<Destination[]>([]);

  $effect(() => {
    // Sync external destinations state
    if (destinations) {
      items = destinations.map((d) => ensureDestinationId(d));
    }
  });

  function update() {
    destinations = items;
    onChange?.(items);
  }

  function addDestination() {
    const prev = items[items.length - 1];
    const newDest: Destination = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dest_${Math.random().toString(36).slice(2, 9)}`,
      name: '',
      country: prev?.country ?? '',
      arriveDate: prev?.departDate ?? tripStartDate ?? '',
      departDate: tripEndDate ?? ''
    };
    items = [...items, newDest];
    update();
  }

  function removeDestination(index: number) {
    items = items.filter((_, i) => i !== index);
    update();
  }

  function moveUp(index: number) {
    if (index <= 0) return;
    const next = [...items];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    items = next;
    update();
  }

  function moveDown(index: number) {
    if (index >= items.length - 1) return;
    const next = [...items];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    items = next;
    update();
  }

  function updateField<K extends keyof Destination>(index: number, key: K, value: Destination[K]) {
    items[index] = { ...items[index], [key]: value };
    update();
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <label class="block text-sm font-medium text-ink" for="dest-editor-header">
      {t('destinations')} ({items.length})
    </label>
    <Button type="button" variant="ghost" size="sm" onclick={addDestination}>
      <Plus class="size-4" /> Add stop / destination
    </Button>
  </div>

  {#if items.length === 0}
    <div class="rounded-lg border border-dashed border-border bg-surface-sunken p-4 text-center">
      <p class="text-sm text-ink-muted">No destinations added yet.</p>
      <Button type="button" variant="outline" size="sm" class="mt-2" onclick={addDestination}>
        <Plus class="size-4" /> Add first destination
      </Button>
    </div>
  {:else}
    <div class="space-y-3">
      {#each items as item, index (item.id || index)}
        <div class="relative rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border/80">
          <div class="mb-2 flex items-center justify-between gap-2 border-b border-border/50 pb-2">
            <span class="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
              <MapPin class="size-3.5" /> Stop #{index + 1}
            </span>
            <div class="flex items-center gap-1">
              {#if items.length > 1}
                <button
                  type="button"
                  disabled={index === 0}
                  onclick={() => moveUp(index)}
                  aria-label="Move destination up"
                  class="rounded p-1 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-30"
                >
                  <ArrowUp class="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={index === items.length - 1}
                  onclick={() => moveDown(index)}
                  aria-label="Move destination down"
                  class="rounded p-1 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-30"
                >
                  <ArrowDown class="size-3.5" />
                </button>
              {/if}
              <button
                type="button"
                onclick={() => removeDestination(index)}
                aria-label="Remove destination"
                class="rounded p-1 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-accent-terracotta"
              >
                <Trash2 class="size-3.5" />
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Field label="City / Place Name" required>
              <Input
                value={item.name || ''}
                placeholder="e.g. Curitiba"
                oninput={(e) => updateField(index, 'name', e.currentTarget.value)}
              />
            </Field>

            <Field label="Country (optional)">
              <Input
                value={item.country || ''}
                placeholder="e.g. BR or Brazil"
                oninput={(e) => updateField(index, 'country', e.currentTarget.value)}
              />
            </Field>

            <Field label="Arrive Date (optional)">
              <Input
                type="date"
                value={item.arriveDate || ''}
                min={tripStartDate}
                max={tripEndDate}
                oninput={(e) => updateField(index, 'arriveDate', e.currentTarget.value)}
              />
            </Field>

            <Field label="Depart Date (optional)">
              <Input
                type="date"
                value={item.departDate || ''}
                min={item.arriveDate || tripStartDate}
                max={tripEndDate}
                oninput={(e) => updateField(index, 'departDate', e.currentTarget.value)}
              />
            </Field>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
