<script lang="ts">
	import { flights as flightsRepo } from '$lib/db';
	import type { Flight } from '$lib/db';
	import { Plane } from 'lucide-svelte';
	import { formatDate } from '$lib/format';
	import { t } from '$lib/i18n.svelte';
	import { cn } from '$lib/utils';
	import type { ResolvedPathname } from '$app/types';
	import WidgetCard from './WidgetCard.svelte';

	interface Props {
		flights: Flight[];
		nextIndex: number;
		href: ResolvedPathname;
	}

	let { flights, nextIndex, href }: Props = $props();

	const shown = $derived(flights.slice(0, 5));
</script>

<WidgetCard title={t('flights')} icon={Plane} {href} linkLabel={t('flights')}>
	{#if flights.length === 0}
		<p class="text-sm text-ink-muted">
			{t('home_none_yet')} –
			<a {href} class="font-medium text-primary-700 hover:underline">{t('home_add_flight')}</a>.
		</p>
	{:else}
		<ul class="space-y-1">
			{#each shown as flight, i (flight._id)}
				<li
					class={cn(
						'flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5',
						i === nextIndex && 'bg-primary-100/60'
					)}
				>
					<span
						class="flex min-w-0 flex-1 items-center gap-2 truncate text-sm font-medium text-ink"
					>
						<Plane class="size-3.5 shrink-0 text-primary-700" />
						<span class="truncate">{flightsRepo.route(flight) || t('flight')}</span>
					</span>
					<span class="shrink-0 text-xs text-ink-muted">
						{formatDate(flight.segments?.[0]?.departLocal ?? null)}{#if i === nextIndex}
							· {t('home_next')}{/if}
					</span>
				</li>
			{/each}
		</ul>
		{#if flights.length > shown.length}
			<p class="mt-2 text-xs text-ink-muted">
				{t('home_more_count', { n: String(flights.length - shown.length) })}
			</p>
		{/if}
	{/if}
</WidgetCard>
