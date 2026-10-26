<script lang="ts">
	import { CalendarDays, Copy, Tag, Trash2 } from 'lucide-svelte';
	import type { ItineraryCategory } from '$lib/db';
	import { Button, MenuItem, Popover } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import { CATEGORY_META, CATEGORY_ORDER } from './categories';

	interface Props {
		count: number;
		busy?: boolean;
		onmove: () => void;
		oncategorise: (category: ItineraryCategory) => void;
		onduplicate: () => void;
		ondelete: () => void;
	}

	let { count, busy = false, onmove, oncategorise, onduplicate, ondelete }: Props = $props();

	const disabled = $derived(busy || count === 0);
	let categoryOpen = $state(false);
</script>

<div
	role="toolbar"
	aria-label={t('batch_actions')}
	aria-busy={busy}
	class="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface p-1.5 shadow-soft"
>
	<Button variant="secondary" size="sm" onclick={onmove} {disabled}>
		<CalendarDays class="size-4" aria-hidden="true" />
		{t('move_to_day')}
	</Button>
	<Popover bind:open={categoryOpen} label={t('batch_category')} align="start">
		{#snippet trigger({ toggle, open })}
			<Button
				variant="secondary"
				size="sm"
				onclick={toggle}
				aria-haspopup="true"
				aria-expanded={open}
				{disabled}
			>
				<Tag class="size-4" aria-hidden="true" />
				{t('batch_category')}
			</Button>
		{/snippet}
		{#each CATEGORY_ORDER as category (category)}
			<MenuItem
				icon={CATEGORY_META[category].icon}
				onclick={() => {
					categoryOpen = false;
					oncategorise(category);
				}}
			>
				{CATEGORY_META[category].label}
			</MenuItem>
		{/each}
	</Popover>
	<Button variant="secondary" size="sm" onclick={onduplicate} {disabled}>
		<Copy class="size-4" aria-hidden="true" />
		{t('duplicate')}
	</Button>
	<Button variant="destructive" size="sm" onclick={ondelete} {disabled}>
		<Trash2 class="size-4" aria-hidden="true" />
		{t('delete')}
	</Button>
</div>
