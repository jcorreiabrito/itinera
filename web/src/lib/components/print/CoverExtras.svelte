<script lang="ts">
	import { t } from '$lib/i18n.svelte';
	import { flightRowLabel, type CoverFacts, type PrintQrImage } from '$lib/print-extras';

	interface Props {
		facts: CoverFacts;
		/** Codes already drawn to data URIs by the route's load. */
		codes: readonly PrintQrImage[];
	}

	let { facts, codes }: Props = $props();

	const hasFacts = $derived(facts.flights.length > 0 || facts.stays.length > 0);
</script>

{#if hasFacts}
	<section class="mt-6" aria-labelledby="print-checkin-heading">
		<h2 id="print-checkin-heading" class="font-serif text-xl font-semibold">
			{t('print_cover_check_in')}
		</h2>
		<div class="mt-3 grid gap-5 sm:grid-cols-2">
			{#if facts.flights.length}
				<div class="break-inside-avoid">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
						{t('print_cover_flights')}
					</h3>
					<ul class="mt-1.5 space-y-2 text-sm">
						{#each facts.flights as row (row.id)}
							{@const label = flightRowLabel(row)}
							<li>
								{#if label}
									<p class="font-medium">{label}</p>
								{/if}
								<p class="text-xs text-ink-muted">
									{t('booking_ref')} <span class="font-mono">{row.reference}</span>
								</p>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if facts.stays.length}
				<div class="break-inside-avoid">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
						{t('print_cover_stays')}
					</h3>
					<ul class="mt-1.5 space-y-2 text-sm">
						{#each facts.stays as row (row.id)}
							<li>
								<p class="font-medium">{row.name || t('reservation')}</p>
								{#if row.address}
									<p class="text-xs text-ink-muted">
										{t('print_address')}: {row.address}
									</p>
								{/if}
								{#if row.phone}
									<p class="text-xs text-ink-muted">
										{t('print_phone')}: <span class="font-mono">{row.phone}</span>
									</p>
								{/if}
								{#if row.reference}
									<p class="text-xs text-ink-muted">
										{t('confirmation')} <span class="font-mono">{row.reference}</span>
									</p>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</section>
{/if}

{#if codes.length}
	<section class="mt-6" aria-labelledby="print-qr-heading">
		<h2 id="print-qr-heading" class="font-serif text-xl font-semibold">
			{t('print_qr_caption')}
		</h2>
		<ul class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
			{#each codes as code (code.id)}
				<li class="break-inside-avoid text-center">
					<img
						src={code.dataUrl}
						alt={code.caption}
						width="120"
						height="120"
						class="mx-auto size-28"
					/>
					<p class="mt-1 text-xs font-medium">{code.caption}</p>
				</li>
			{/each}
		</ul>
	</section>
{/if}
