<script lang="ts">
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { Trip } from '$lib/db';
	import { toast } from '$lib/components/ui';
	import { getApiUrl } from '$lib/api';
	import { copyToClipboard } from '$lib/utils/clipboard';

	let { open = $bindable(false), trip }: { open: boolean; trip: Trip } = $props();

	const destinationName = $derived(trip.destinations?.[0]?.name || trip.title);

	let shareUrl = $derived(
		typeof window !== 'undefined'
			? `${window.location.origin}${getApiUrl(`/trips/${encodeURIComponent(trip._id)}/print.pdf`)}`
			: ''
	);

	async function handleCopyLink() {
		const success = await copyToClipboard(shareUrl);
		if (success) {
			toast.success('Printable PDF link copied to clipboard!');
		} else {
			toast.error('Failed to copy link to clipboard.');
		}
	}
</script>

<Dialog bind:open title={`Share "${destinationName}"`}>
	<div class="space-y-4 text-sm">
		<p class="text-ink-muted">
			Generate a printable PDF or copy a direct link to share your trip itinerary with travel
			companions.
		</p>

		<div class="space-y-2 rounded-lg border border-border bg-surface-sunken p-3">
			<div class="text-xs font-medium uppercase tracking-wider text-ink">Trip Summary PDF</div>
			<div
				class="break-all rounded border border-border bg-surface p-2 font-mono text-xs text-primary-700"
			>
				{shareUrl}
			</div>
		</div>

		<div class="flex items-center justify-between pt-2">
			<a
				href={shareUrl}
				target="_blank"
				rel="noopener noreferrer external"
				class="inline-flex items-center space-x-1 text-xs font-medium text-primary-600 hover:text-primary-700"
			>
				<span>Open PDF Preview</span>
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
					/>
				</svg>
			</a>

			<div class="flex space-x-2">
				<Button variant="ghost" onclick={() => (open = false)}>Close</Button>
				<Button onclick={handleCopyLink}>Copy Link</Button>
			</div>
		</div>
	</div>
</Dialog>
