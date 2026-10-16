<script lang="ts">
	import { RotateCw, TriangleAlert } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { t } from '$lib/i18n.svelte';
	import Button from './Button.svelte';

	interface Props {
		title?: string;
		description?: string;
		/** When provided, renders a Retry button that calls this. */
		onretry?: () => void;
		retrying?: boolean;
		class?: string;
	}

	let {
		title: titleProp,
		description: descriptionProp,
		onretry,
		retrying = false,
		class: className
	}: Props = $props();

	// Resolved here rather than as destructuring defaults so the fallback copy
	// follows the active language instead of the one active at first render.
	const title = $derived(titleProp ?? t('error_state_title'));
	const description = $derived(descriptionProp ?? t('error_state_desc'));
</script>

<div
	role="alert"
	class={cn('rounded-lg border border-danger/30 bg-danger/5 px-6 py-10 text-center', className)}
>
	<TriangleAlert class="mx-auto size-8 text-danger" aria-hidden="true" />
	<h2 class="mt-3 text-base font-semibold text-ink">{title}</h2>
	<p class="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
	{#if onretry}
		<Button class="mt-4" variant="secondary" onclick={onretry} disabled={retrying}>
			<RotateCw class={cn('size-4', retrying && 'animate-spin')} />
			{retrying ? t('retrying') : t('retry')}
		</Button>
	{/if}
</div>
