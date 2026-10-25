<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Flight, FlightSegment, Reservation } from '$lib/db';
	import { dateOf } from '$lib/db/datetime';
	import { formatTime } from '$lib/format';
	import { ChevronRight, MapPin, Plane } from 'lucide-svelte';
	import { Badge, Card } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';

	interface Props {
		flights: Flight[];
		reservations: Reservation[];
		date: string;
		hrefBookings: ResolvedPathname;
	}

	let { flights, reservations, date, hrefBookings }: Props = $props();

	function segmentOn(flight: Flight, day: string): FlightSegment | null {
		return (flight.segments ?? []).find((segment) => dateOf(segment.departLocal) === day) ?? null;
	}
</script>

<section aria-labelledby="today-tickets-heading" class="space-y-3">
	<h2 id="today-tickets-heading" class="font-serif text-lg font-semibold text-ink">
		{t('today_tickets')}
	</h2>

	<ul class="space-y-2">
		{#each flights as flight (flight._id)}
			{@const segment = segmentOn(flight, date)}
			{#if segment}
				<li>
					<a
						href={hrefBookings}
						class="block rounded-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.99]"
					>
						<Card class="p-3 hover:border-primary-600/40 hover:bg-surface-sunken">
							<div class="flex items-start gap-3">
								<span
									class="w-12 shrink-0 pt-0.5 text-right text-sm font-semibold tabular-nums text-ink"
								>
									{formatTime(segment.departLocal)}
								</span>
								<span
									class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-info/30 bg-info/10 text-info [&_svg]:size-4"
									aria-hidden="true"
								>
									<Plane />
								</span>
								<span class="min-w-0 flex-1">
									<span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
										<span class="text-sm font-medium text-ink">
											{#if segment.flightNumber}{t('flight_n', {
													n: segment.flightNumber
												})}{:else}{t('flight')}{/if}
										</span>
										<span class="text-sm tabular-nums text-ink">
											{segment.from?.code ?? segment.from?.city ?? '–'} →
											{segment.to?.code ?? segment.to?.city ?? '–'}
										</span>
										{#if flight.bookingRef}
											<span class="text-xs text-ink-muted">
												{t('booking_ref')}
												<span class="font-medium text-ink">{flight.bookingRef}</span>
											</span>
										{/if}
									</span>
									{#if segment.airline}
										<span class="mt-0.5 block truncate text-xs text-ink-muted"
											>{segment.airline}</span
										>
									{/if}
									<span class="mt-1 flex flex-wrap items-center gap-1.5">
										{#if segment.terminal}
											<Badge variant="neutral">{t('terminal')} {segment.terminal}</Badge>
										{/if}
										{#if segment.gate}
											<Badge variant="neutral">{t('gate')} {segment.gate}</Badge>
										{/if}
										{#if segment.seat}
											<Badge variant="neutral">{t('seat')} {segment.seat}</Badge>
										{/if}
									</span>
								</span>
								<ChevronRight class="mt-1 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
							</div>
						</Card>
					</a>
				</li>
			{/if}
		{/each}

		{#each reservations as reservation (reservation._id)}
			<li>
				<a
					href={hrefBookings}
					class="block rounded-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.99]"
				>
					<Card class="p-3 hover:border-primary-600/40 hover:bg-surface-sunken">
						<div class="flex items-start gap-3">
							<span
								class="w-12 shrink-0 pt-0.5 text-right text-sm font-semibold tabular-nums text-ink"
							>
								{formatTime(reservation.start)}
							</span>
							<span
								class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary-700 [&_svg]:size-4"
								aria-hidden="true"
							>
								<MapPin />
							</span>
							<span class="min-w-0 flex-1">
								<span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
									<span class="min-w-0 truncate text-sm font-medium text-ink">
										{reservation.name ?? t('reservation')}
									</span>
									{#if reservation.confirmation}
										<span class="text-xs text-ink-muted">
											{t('confirmation')}
											<span class="font-medium text-ink">{reservation.confirmation}</span>
										</span>
									{/if}
								</span>
								{#if reservation.location?.name}
									<span class="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
										<MapPin class="size-3 shrink-0" aria-hidden="true" />
										<span class="max-w-[14rem] truncate">{reservation.location.name}</span>
									</span>
								{/if}
							</span>
							<ChevronRight class="mt-1 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
						</div>
					</Card>
				</a>
			</li>
		{/each}
	</ul>
</section>
