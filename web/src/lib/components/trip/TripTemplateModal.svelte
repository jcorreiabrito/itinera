<script lang="ts">
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { trips, checklist } from '$lib/db';
  import { toast } from '$lib/components/ui';
  import { Building2, Sun, Car } from 'lucide-svelte';

  let {
    open = $bindable(false),
    onCreated,
  }: {
    open: boolean;
    onCreated?: (tripId: string) => void;
  } = $props();

  const TEMPLATES = [
    {
      id: 'weekend-getaway',
      name: 'Weekend City Break',
      icon: Building2,
      description: 'Standard 3-day weekend trip with essential packing & travel checklist',
      destination: 'Paris, France',
      items: [
        'Pack passport & travel documents',
        'Book museum tickets',
        'Confirm hotel reservation',
        'Pack comfortable walking shoes',
        'Check weather forecast',
      ],
    },
    {
      id: 'beach-vacation',
      name: 'Beach & Sun Getaway',
      icon: Sun,
      description: '7-day beach holiday template with resort & sun protection checklist',
      destination: 'Cancún, Mexico',
      items: [
        'Pack swimwear & reef-safe sunscreen',
        'Bring sunglasses & sun hat',
        'Confirm flight & airport transfers',
        'Set up offline maps',
        'Notify bank of international travel',
      ],
    },
    {
      id: 'road-trip',
      name: 'Road Trip Adventure',
      icon: Car,
      description: 'Scenic road trip with vehicle prep and playlist checklist',
      destination: 'Route 66, USA',
      items: [
        'Inspect car tire pressure & oil level',
        'Download offline driving maps',
        'Prepare road trip music playlist',
        'Pack emergency car kit & first aid',
        'Reserve roadside motel stopovers',
      ],
    },
  ];

  let selectedTemplate = $state(TEMPLATES[0]);
  let loading = $state(false);

  async function handleApply() {
    loading = true;
    try {
      const trip = await trips.create({
        title: selectedTemplate.name,
        startDate: '',
        endDate: '',
        homeCurrency: 'EUR',
        destinations: selectedTemplate.destination ? [{ name: selectedTemplate.destination }] : [],
        notes: `Created from ${selectedTemplate.name} template`,
      });

      for (const text of selectedTemplate.items) {
        await checklist.create(trip._id, {
          text,
          group: 'Packing',
        });
      }

      toast.success(`Created trip from "${selectedTemplate.name}" template!`);
      open = false;
      if (onCreated) onCreated(trip._id);
    } catch (err) {
      console.error('Failed to create trip from template', err);
      toast.error('Failed to create trip from template');
    } finally {
      loading = false;
    }
  }
</script>

<Dialog bind:open title="Start from a Trip Template">
  <div class="space-y-4">
    <p class="text-sm text-ink-muted">
      Select a pre-configured template to jumpstart your trip planning with sample checklists and itinerary ideas.
    </p>

    <div class="grid gap-3 sm:grid-cols-1">
      {#each TEMPLATES as t (t.id)}
        {@const Icon = t.icon}
        <button
          type="button"
          onclick={() => (selectedTemplate = t)}
          class={`text-left p-3.5 rounded-lg border transition-all ${
            selectedTemplate.id === t.id
              ? 'border-primary-600 bg-primary-100/30 ring-1 ring-primary-600'
              : 'border-border bg-surface hover:bg-surface-sunken'
          }`}
        >
          <div class="flex items-center space-x-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-md bg-primary-100 text-primary-700">
              <Icon class="size-5" />
            </span>
            <div>
              <div class="font-semibold text-ink">{t.name}</div>
              <div class="text-xs text-ink-muted">{t.description}</div>
            </div>
          </div>
        </button>
      {/each}
    </div>

    <div class="flex justify-end space-x-2 pt-2">
      <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={handleApply} disabled={loading}>
        {loading ? 'Creating...' : 'Create Trip from Template'}
      </Button>
    </div>
  </div>
</Dialog>
