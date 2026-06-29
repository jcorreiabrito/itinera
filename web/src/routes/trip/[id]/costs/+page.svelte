<script lang="ts">
  import { page } from '$app/state';
  import { CostsPane } from '$lib/components/costs';

  const id = $derived(page.params.id ?? '');
</script>

<svelte:head><title>Costs – Itinera</title></svelte:head>

<section aria-labelledby="costs-heading">
  <h1 id="costs-heading" class="sr-only">Costs &amp; budget</h1>
  {#key id}
    <CostsPane tripid={id} />
  {/key}
</section>
