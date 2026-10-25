<script lang="ts">
	import { page } from '$app/state';
	import { ExportCenter } from '$lib/components/export';
	import { t } from '$lib/i18n.svelte';

	const id = $derived(page.params.id ?? '');
</script>

<svelte:head><title>{t('export_center_title')} – Itinera</title></svelte:head>

<section aria-labelledby="export-heading">
	<h2 id="export-heading" class="sr-only">{t('export_center_title')}</h2>
	{#key id}
		<ExportCenter tripId={id} />
	{/key}
</section>
