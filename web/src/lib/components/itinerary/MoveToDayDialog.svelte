<script lang="ts">
	import { Lightbulb, Check } from 'lucide-svelte';
	import { Dialog } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import { cn } from '$lib/utils';
	import { dayOptionLabel, type DayOption } from './day-options';

	interface Props {
		open?: boolean;
		/** The trip's days, dated or numbered. */
		days: DayOption[];
		/** The item's current day key ('null' = Unscheduled). */
		current: string | null;
		/** Item title, for the dialog description. */
		title?: string;
		onmove: (key: string | null) => void;
	}

	let { open = $bindable(false), days, current, title, onmove }: Props = $props();

	function choose(key: string | null) {
		open = false;
		if (key !== current) onmove(key);
	}

	const rowClass = (active: boolean) =>
		cn(
			'flex min-h-touch w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
			active
				? 'border-primary-600 bg-primary-100 text-primary-700'
				: 'border-border bg-surface text-ink hover:bg-surface-sunken'
		);
</script>

<Dialog
	bind:open
	title={t('day_move_to_title')}
	description={title ? t('where_should_item_go', { title }) : undefined}
>
	<ul class="flex max-h-[60dvh] flex-col gap-1.5 overflow-y-auto pr-1">
		<li>
			<button type="button" class={rowClass(current === null)} onclick={() => choose(null)}>
				<span class="flex items-center gap-2">
					<Lightbulb class="size-4 text-accent-terracotta" />
					{t('unscheduled_ideas')}
				</span>
				{#if current === null}<Check class="size-4" />{/if}
			</button>
		</li>
		{#each days as day (day.key)}
			<li>
				<button type="button" class={rowClass(current === day.key)} onclick={() => choose(day.key)}>
					<span>{dayOptionLabel(day)}</span>
					{#if current === day.key}<Check class="size-4" />{/if}
				</button>
			</li>
		{/each}
	</ul>
</Dialog>
