<script lang="ts">
	import type { ChecklistItem } from '$lib/db';
	import { Star } from 'lucide-svelte';
	import { Card } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import { cn } from '$lib/utils';

	interface Props {
		items: ChecklistItem[];
		ontoggle: (item: ChecklistItem) => void;
	}

	let { items, ontoggle }: Props = $props();

	const done = $derived(items.filter((item) => item.done).length);
</script>

<section aria-labelledby="today-todos-heading" class="space-y-3">
	<div class="flex items-baseline justify-between gap-2">
		<h2 id="today-todos-heading" class="font-serif text-lg font-semibold text-ink">
			{t('today_todos')}
		</h2>
		<span class="text-xs tabular-nums text-ink-muted">
			{t('todos_progress', { done: String(done), total: String(items.length) })}
		</span>
	</div>

	<Card>
		<ul class="divide-y divide-border px-3">
			{#each items as item (item._id)}
				<li>
					<label
						class="flex min-h-touch cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-surface-sunken"
					>
						<input
							type="checkbox"
							checked={item.done}
							onchange={() => ontoggle(item)}
							aria-label={item.text ?? t('to_do')}
							class="size-5 shrink-0 rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30"
						/>
						<span
							class={cn('min-w-0 flex-1', item.done ? 'text-ink-muted line-through' : 'text-ink')}
						>
							{item.text ?? t('to_do')}
						</span>
						{#if item.important}
							<Star
								class="size-3.5 shrink-0 fill-accent-amber text-accent-amber"
								aria-label={t('important')}
							/>
						{/if}
					</label>
				</li>
			{/each}
		</ul>
	</Card>
</section>
