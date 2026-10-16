<script lang="ts">
	/**
	 * The iOS storage-eviction warning.
	 *
	 * Safari deletes a site's stored data after seven days without a visit —
	 * unless the site is installed to the home screen, when it is treated as an
	 * app and kept. Itinera keeps every trip in IndexedDB on the device, so a
	 * user who plans a trip in January would open the app at the airport in
	 * March to an empty list, with no error and no way to have known.
	 *
	 * `platform.ts` owns the decision of whether the warning applies (iOS or
	 * iPadOS, in a tab, with local data); this component only renders it and
	 * remembers the dismissal. Shown in Settings → Storage durability and, once,
	 * as a banner on the trips list.
	 */
	import { onMount } from 'svelte';
	import { AlertTriangle, X } from 'lucide-svelte';
	import { t } from '$lib/i18n.svelte';
	import Button from './Button.svelte';
	import { readEnv, shouldWarnAboutEviction } from '$lib/utils/platform';

	interface Props {
		/** Compact banner (trips list) instead of the full panel (Settings). */
		compact?: boolean;
	}

	let { compact = false }: Props = $props();

	/** Dismissed once, gone from both places: the user has read it. */
	const DISMISS_KEY = 'itinera_ios_eviction_notice_dismissed';

	let shown = $state(false);

	onMount(() => {
		try {
			if (localStorage.getItem(DISMISS_KEY)) return;
		} catch {
			/* Storage unavailable (private mode): show it anyway; the dismissal
			   simply will not survive a reload. */
		}
		shown = shouldWarnAboutEviction(readEnv(), true);
	});

	function dismiss() {
		shown = false;
		try {
			localStorage.setItem(DISMISS_KEY, '1');
		} catch {
			/* non-fatal */
		}
	}
</script>

{#if shown}
	{#if compact}
		<div
			class="mx-auto mb-5 flex max-w-6xl items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-ink"
			role="status"
		>
			<AlertTriangle class="mt-0.5 size-4 shrink-0 text-warning" />
			<p class="min-w-0 flex-1">
				<span class="font-medium">{t('ios_eviction_title')}.</span>
				{t('ios_eviction_steps')}
			</p>
			<button
				type="button"
				onclick={dismiss}
				aria-label={t('dismiss')}
				class="-m-1 grid size-9 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-warning/20 hover:text-ink [&_svg]:size-4"
			>
				<X />
			</button>
		</div>
	{:else}
		<div class="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
			<div class="flex items-start gap-3">
				<AlertTriangle class="mt-0.5 size-4 shrink-0 text-warning" />
				<div class="min-w-0 flex-1">
					<p class="text-sm font-medium text-ink">{t('ios_eviction_title')}</p>
					<p class="mt-1 text-xs leading-relaxed text-ink-muted">{t('ios_eviction_body')}</p>
					<p class="mt-1 text-xs leading-relaxed text-ink-muted">{t('ios_eviction_steps')}</p>
					<Button variant="ghost" size="sm" class="mt-2" onclick={dismiss}>
						{t('dismiss')}
					</Button>
				</div>
			</div>
		</div>
	{/if}
{/if}
