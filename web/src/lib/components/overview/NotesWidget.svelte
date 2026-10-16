<script lang="ts">
	import { NotebookPen } from 'lucide-svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { t } from '$lib/i18n.svelte';
	import WidgetCard from './WidgetCard.svelte';

	interface Props {
		notes?: string | null;
		onedit: () => void;
	}

	let { notes, onedit }: Props = $props();

	const html = $derived(renderMarkdown(notes));
</script>

<WidgetCard title={t('notes')} icon={NotebookPen}>
	{#snippet action()}
		<button
			type="button"
			onclick={onedit}
			class="text-xs font-medium text-primary-700 hover:underline"
		>
			{t('edit')}
		</button>
	{/snippet}

	{#if html}
		<div class="space-y-1 text-sm leading-relaxed text-ink">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- `html` comes from the safe Markdown renderer ($lib/markdown.ts) -->
			{@html html}
		</div>
	{:else}
		<button type="button" onclick={onedit} class="text-sm text-primary-700 hover:underline">
			{t('click_to_add_notes')}
		</button>
	{/if}
</WidgetCard>
