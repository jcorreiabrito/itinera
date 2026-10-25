<script lang="ts" module>
	// Bootstrap the data layer exactly once for the app's lifetime.
	let booted = false;
</script>

<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { initDb } from '$lib/db';
	import { initLanguage } from '$lib/i18n.svelte';
	import { Toaster, toast } from '$lib/components/ui';
	import { CommandPalette } from '$lib/components/command';
	import ReloadPrompt from '$lib/components/ReloadPrompt.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';

	import { theme } from '$lib/stores/theme.svelte';
	import { viewport } from '$lib/stores/viewport.svelte';

	import * as dbRepo from '$lib/db';

	let { children }: { children: Snippet } = $props();

	let commandOpen = $state(false);

	onMount(() => {
		theme.init();
		viewport.init();

		/*
		 * Cmd/Ctrl-K has to work while the user is typing — hunting through the
		 * navigation is exactly what it replaces. Shift and Alt are excluded:
		 * Ctrl+Shift+K is the browser console in Firefox, and AltGr produces `k`
		 * on some layouts, so neither should hijack the palette.
		 */
		const onKeydown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
			if (event.key.toLowerCase() !== 'k') return;
			event.preventDefault();
			commandOpen = true;
		};
		window.addEventListener('keydown', onKeydown);

		if (!booted) {
			booted = true;
			// Load language preference from settings
			initLanguage();
			// Creates the local db, requests persistent storage, ensures indexes, runs
			// migrations, and starts live sync. The UI reads/writes local data only.
			initDb()
				.then((db) => {
					if (typeof window !== 'undefined') {
						(window as unknown as { db: typeof db }).db = db;
						if (import.meta.env.DEV) {
							(window as unknown as { dbRepo: typeof dbRepo }).dbRepo = dbRepo;
						}
					}
				})
				.catch((error) => {
					console.error('initDb failed', error);
					toast.error('Could not open local storage. Some features may be unavailable.');
				});
		}

		return () => window.removeEventListener('keydown', onKeydown);
	});
</script>

<a
	href="#page-content"
	class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:border focus:border-border focus:bg-surface focus:p-4 focus:text-ink focus:shadow-md"
>
	Skip to main content
</a>

<div class="flex min-h-dvh flex-col" id="main-content">
	<!-- Dynamic Gradient Mesh Background -->
	<div class="mesh-container" aria-hidden="true">
		<div class="mesh-orb mesh-orb-1"></div>
		<div class="mesh-orb mesh-orb-2"></div>
		<div class="mesh-orb mesh-orb-3"></div>
	</div>

	<OfflineBanner />
	{@render children()}
</div>

<Toaster />
<CommandPalette bind:open={commandOpen} />
<ReloadPrompt />
