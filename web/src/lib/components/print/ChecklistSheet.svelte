<script lang="ts">
	import { Scissors } from 'lucide-svelte';
	import type { ChecklistItem } from '$lib/db';
	import { t } from '$lib/i18n.svelte';

	interface Props {
		groups: readonly { name: string; items: readonly ChecklistItem[] }[];
		/**
		 * The standalone tear-off sheet: a cut line at the top and ticks large
		 * enough to fill with a pen. The booklet keeps the compact list.
		 */
		tearOff?: boolean;
	}

	let { groups, tearOff = false }: Props = $props();
</script>

{#if tearOff}
	<div
		class="mt-3 flex items-center gap-2 border-t-2 border-dashed border-border pt-1.5 text-xs uppercase tracking-wide text-ink-muted"
		aria-hidden="true"
	>
		<Scissors class="size-4 shrink-0" />
		<span>{t('print_cut_here')}</span>
	</div>
{/if}

<div class="mt-3 gap-6 sm:columns-2">
	{#each groups as group (group.name)}
		<div class="mb-4 break-inside-avoid">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">{group.name}</h3>
			<ul class={tearOff ? 'mt-2 space-y-2 text-sm' : 'mt-1 space-y-0.5 text-sm'}>
				{#each group.items as item (item._id)}
					<li class="flex items-baseline gap-2">
						<!--
							A drawn box, not a glyph: paper has no toggle, so the point of
							printing a checklist is something to tick with a pen. A finished
							item still shows its state by being filled.
						-->
						<span
							class="mt-0.5 inline-block shrink-0 rounded-sm border border-ink/60 {item.done
								? 'bg-ink'
								: ''} {tearOff ? 'size-6' : 'size-3'}"
							aria-hidden="true"
						></span>
						<span class={item.done ? 'text-ink-muted line-through' : ''}>
							{item.text}
							{#if item.quantity && item.quantity > 1}
								<span class="text-ink-muted">×{item.quantity}</span>
							{/if}
						</span>
						<span class="sr-only">{item.done ? t('done') : t('not_done')}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
