<script lang="ts">
	/**
	 * Route-level error page.
	 *
	 * Without this file a failed `load` renders SvelteKit's unstyled default,
	 * which on a phone is a bare centred sentence with no way back — the user's
	 * only recovery is the browser Back button. This gives every route the same
	 * two exits (retry the route, or go to the trip list) in the app's own shell.
	 *
	 * `page.error` is `App.Error | null`; the app's `handleError` hook in
	 * `src/hooks.client.ts` / `hooks.server.ts` decides what actually reaches the
	 * client, so `message` here is already the safe, user-facing text.
	 */
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { AlertTriangle, RotateCw } from 'lucide-svelte';
	import { t } from '$lib/i18n.svelte';
	import { Button } from '$lib/components/ui';

	let retrying = $state(false);

	const status = $derived(page.status);
	const isNotFound = $derived(status === 404);

	/*
	 * `invalidateAll()` re-runs every active `load`, which is the honest retry:
	 * it re-issues the failing query rather than re-rendering the same error.
	 * Reloading the tab is the fallback when the failure was in the app shell
	 * itself (a chunk that failed to import, say), where invalidate cannot help.
	 */
	async function retry() {
		retrying = true;
		try {
			const { invalidateAll } = await import('$app/navigation');
			await invalidateAll();
		} catch {
			location.reload();
		} finally {
			retrying = false;
		}
	}

	/*
	 * A 404 mid-session is usually a stale link, so focus the heading to tell a
	 * screen reader the page changed — SvelteKit swaps the route without a
	 * document navigation, so nothing announces it otherwise.
	 */
	let heading = $state<HTMLHeadingElement>();
	onMount(() => heading?.focus());
</script>

<svelte:head>
	<title>{isNotFound ? t('not_found_title') : t('error_title')}</title>
</svelte:head>

<div class="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
	<AlertTriangle class="size-10 text-warning" aria-hidden="true" />

	<h1
		bind:this={heading}
		tabindex="-1"
		class="mt-4 font-serif text-xl font-semibold text-ink outline-none sm:text-2xl"
	>
		{isNotFound ? t('error_not_found_heading') : t('error_heading')}
	</h1>

	<p class="mt-2 max-w-prose text-sm text-ink-muted">
		{#if isNotFound}
			{t('error_not_found_desc')}
		{:else if page.error?.message}
			{page.error.message}
		{:else}
			{t('error_generic_desc')}
		{/if}
	</p>

	{#if !isNotFound && page.error?.message}
		<p class="mt-1 text-xs text-ink-muted/80">{t('error_reference', { code: String(status) })}</p>
	{/if}

	<div class="mt-6 flex flex-wrap items-center justify-center gap-2">
		<Button onclick={retry} disabled={retrying}>
			<RotateCw class="size-4" />
			{retrying ? t('retrying') : t('retry')}
		</Button>
		<Button variant="secondary" href={resolve('/')}>{t('back_to_trips')}</Button>
	</div>
</div>
