<script lang="ts">
	import { page } from '$app/state';
	import { CostsPane } from '$lib/components/costs';
	import { t } from '$lib/i18n.svelte';

	const id = $derived(page.params.id ?? '');
</script>

<svelte:head><title>{t('costs_title')} – Itinera</title></svelte:head>

<section aria-labelledby="costs-heading">
	<h2 id="costs-heading" class="sr-only">{t('costs_title')}</h2>
	{#key id}
		<CostsPane tripId={id} />
	{/key}
</section>
