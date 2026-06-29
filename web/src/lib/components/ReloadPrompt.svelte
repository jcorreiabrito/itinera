<script lang="ts">
	import { onMount } from 'svelte';
	import { RefreshCw, X } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { applyUpdate, needRefresh, offlineReady, registerServiceWorker } from '$lib/pwa';

	onMount(registerServiceWorker);

	function close() {
		offlineReady.set(false);
		needRefresh.set(false);
	}
</script>

{#if $offlineReady || $needRefresh}
	<div
		role="status"
		aria-live="polite"
		class="fixed inset-x-0 bottom-24 z-[100] mx-auto flex w-[min(92vw,28rem)] items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-sheet sm:bottom-6"
	>
		<div
			class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-600 [&_svg]:size-5"
			aria-hidden="true"
		>
			<RefreshCw />
		</div>

		<div class="flex-1 text-sm">
			{#if $needRefresh}
				<p class="font-medium text-ink">Update available</p>
				<p class="text-ink-muted">Reload to get the latest version of Itinera.</p>
			{:else}
				<p class="font-medium text-ink">Ready to work offline</p>
				<p class="text-ink-muted">Itinera will keep working without a connection.</p>
			{/if}
		</div>

		{#if $needRefresh}
			<Button size="sm" onclick={applyUpdate}>Reload</Button>
		{/if}

		<button
			type="button"
			onclick={close}
			aria-label="Dismiss"
			class="-mr-1 grid size-6 shrink-0 place-items-center rounded text-ink-muted transition-colors hover:text-ink"
		>
			<X class="size-4" />
		</button>
	</div>
{/if}
