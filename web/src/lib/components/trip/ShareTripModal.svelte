<script lang="ts">
	import { resolve } from '$app/paths';
	import { Dialog, toast } from '$lib/components/ui';
	import Button from '$lib/components/ui/Button.svelte';
	import type { Trip } from '$lib/db';
	import { getApiUrl } from '$lib/api';
	import { getLanguage, t } from '$lib/i18n.svelte';
	import { copyToClipboard } from '$lib/utils/clipboard';
	import { Printer, ExternalLink } from 'lucide-svelte';

	let { open = $bindable(false), trip }: { open: boolean; trip: Trip } = $props();

	const destinationName = $derived(trip.destinations?.[0]?.name || trip.title || '');

	/*
	 * Two destinations, and the difference is the user's to make:
	 *
	 * - the printable view is this device's own rendering — offline, instant, and
	 *   identical in its numbers to the screens, because it is the same code;
	 * - the server PDF link only resolves while the home server is reachable, but
	 *   it is a plain URL you can send to someone else.
	 *
	 * Both used to be presented as "the PDF", so an offline user clicked a link
	 * that could not resolve and had no way to tell why.
	 *
	 * `?lang=` is part of the link, not an afterthought. The server renders the
	 * document and has no other way to know this device's language, so without
	 * it a pt-BR user copied a link to an English PDF. Pinning the *sender's*
	 * language also makes the link stable: whoever opens it sees the same
	 * document, whatever their own browser is set to.
	 */
	let shareUrl = $derived(
		typeof window !== 'undefined'
			? `${window.location.origin}${getApiUrl(
					`/trips/${encodeURIComponent(trip._id)}/print.pdf?lang=${encodeURIComponent(getLanguage())}`
				)}`
			: ''
	);

	async function handleCopyLink() {
		const success = await copyToClipboard(shareUrl);
		if (success) toast.success(t('link_copied'));
		else toast.error(t('could_not_copy_link'));
	}
</script>

<Dialog
	title={t('share_trip_title', { name: destinationName })}
	description={t('share_trip_desc')}
	bind:open
>
	<div class="space-y-4 text-sm">
		<!-- The offline path first: it is the one that always works. -->
		<div class="rounded-lg border border-border bg-surface-sunken p-3">
			<p class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
				{t('print_or_pdf')}
			</p>
			<p class="mt-1 text-ink-muted">{t('print_offline_desc')}</p>
			<a
				href={resolve('/trip/[id]/print', { id: trip._id })}
				onclick={() => (open = false)}
				class="mt-3 inline-flex min-h-touch items-center gap-2 rounded-md bg-primary-600 px-4 text-sm font-medium text-white shadow-soft transition-colors hover:bg-primary-700 active:scale-[0.97] [&_svg]:size-4"
			>
				<Printer />
				{t('open_printable_view')}
			</a>
		</div>

		<!-- The shareable link. Needs the home server. -->
		<div class="rounded-lg border border-border bg-surface-sunken p-3">
			<p class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
				{t('server_pdf_link')}
			</p>
			<p class="mt-1 text-ink-muted">{t('server_pdf_desc')}</p>
			<div
				class="mt-2 break-all rounded border border-border bg-surface p-2 font-mono text-xs text-primary-700"
			>
				{shareUrl}
			</div>
			<div class="mt-3 flex flex-wrap items-center gap-2">
				<Button size="sm" onclick={handleCopyLink}>{t('copy_link')}</Button>
				<a
					href={shareUrl}
					target="_blank"
					rel="noopener noreferrer external"
					class="inline-flex min-h-touch items-center gap-1.5 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700 [&_svg]:size-3.5"
				>
					<ExternalLink />
					{t('open_pdf_preview')}
				</a>
			</div>
		</div>

		<div class="flex justify-end pt-1">
			<Button variant="ghost" onclick={() => (open = false)}>{t('close')}</Button>
		</div>
	</div>
</Dialog>
