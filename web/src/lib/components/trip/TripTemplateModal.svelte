<script lang="ts">
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { trips, checklist } from '$lib/db';
	import { toast } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import { Building2, Sun, Car } from 'lucide-svelte';

	let {
		open = $bindable(false),
		onCreated
	}: {
		open: boolean;
		onCreated?: (tripId: string) => void;
	} = $props();

	const TEMPLATES = $derived([
		{
			id: 'weekend-getaway',
			name: t('tpl_weekend_name'),
			icon: Building2,
			description: t('tpl_weekend_desc'),
			destination: t('tpl_weekend_dest'),
			items: [
				t('tpl_weekend_item_1'),
				t('tpl_weekend_item_2'),
				t('tpl_weekend_item_3'),
				t('tpl_weekend_item_4'),
				t('tpl_weekend_item_5')
			]
		},
		{
			id: 'beach-vacation',
			name: t('tpl_beach_name'),
			icon: Sun,
			description: t('tpl_beach_desc'),
			destination: t('tpl_beach_dest'),
			items: [
				t('tpl_beach_item_1'),
				t('tpl_beach_item_2'),
				t('tpl_beach_item_3'),
				t('tpl_beach_item_4'),
				t('tpl_beach_item_5')
			]
		},
		{
			id: 'road-trip',
			name: t('tpl_road_name'),
			icon: Car,
			description: t('tpl_road_desc'),
			destination: t('tpl_road_dest'),
			items: [
				t('tpl_road_item_1'),
				t('tpl_road_item_2'),
				t('tpl_road_item_3'),
				t('tpl_road_item_4'),
				t('tpl_road_item_5')
			]
		}
	]);

	let selectedId = $state('weekend-getaway');
	const selectedTemplate = $derived(TEMPLATES.find((tpl) => tpl.id === selectedId) ?? TEMPLATES[0]);
	let loading = $state(false);

	async function handleApply() {
		loading = true;
		try {
			const chosen = selectedTemplate;
			const trip = await trips.create({
				title: chosen.name,
				dateMode: 'dream',
				dreamDayCount: 1,
				homeCurrency: 'EUR',
				destinations: chosen.destination ? [{ name: chosen.destination }] : [],
				notes: t('created_from_template_note', { name: chosen.name })
			});

			for (const text of chosen.items) {
				await checklist.create(trip._id, {
					text,
					group: t('packing')
				});
			}

			toast.success(t('trip_created_from_template', { name: chosen.name }));
			open = false;
			if (onCreated) onCreated(trip._id);
		} catch (err) {
			console.error('Failed to create trip from template', err);
			toast.error(t('could_not_create_from_template'));
		} finally {
			loading = false;
		}
	}
</script>

<Dialog bind:open title={t('template_modal_title')}>
	<div class="space-y-4">
		<p class="text-sm text-ink-muted">
			{t('template_modal_desc')}
		</p>

		<div class="grid gap-3 sm:grid-cols-1">
			{#each TEMPLATES as tpl (tpl.id)}
				{@const Icon = tpl.icon}
				<button
					type="button"
					onclick={() => (selectedId = tpl.id)}
					class={`rounded-lg border p-3.5 text-left transition-all ${
						selectedId === tpl.id
							? 'border-primary-600 bg-primary-100/30 ring-1 ring-primary-600'
							: 'border-border bg-surface hover:bg-surface-sunken'
					}`}
				>
					<div class="flex items-center space-x-3">
						<span
							class="grid size-9 shrink-0 place-items-center rounded-md bg-primary-100 text-primary-700"
						>
							<Icon class="size-5" />
						</span>
						<div>
							<div class="font-semibold text-ink">{tpl.name}</div>
							<div class="text-xs text-ink-muted">{tpl.description}</div>
						</div>
					</div>
				</button>
			{/each}
		</div>

		<div class="flex justify-end space-x-2 pt-2">
			<Button variant="ghost" onclick={() => (open = false)}>{t('cancel')}</Button>
			<Button onclick={handleApply} disabled={loading}>
				{loading ? t('creating') : t('create_trip_from_template')}
			</Button>
		</div>
	</div>
</Dialog>
