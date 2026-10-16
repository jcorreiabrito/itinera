<script lang="ts">
	/**
	 * The printable document.
	 *
	 * This route is the app's own answer to "give me a PDF". Everything the
	 * browser needs is already on the device — the Dump, the prices, the fonts —
	 * so printing from here works with no server, no network and no WeasyPrint,
	 * and the numbers on paper are produced by exactly the same `formatMoney` and
	 * day-timeline code the screens use. There is no second implementation to
	 * drift, which is what the server-side `print.pdf` endpoint can never promise.
	 *
	 * Layout is decided by `@media print` in `src/app.css` plus the two helpers
	 * it exposes: `.no-print` for chrome that must not reach paper, and
	 * `.page-break` for the major sections that should start a new sheet.
	 */
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { checklist, expenses, flights, itinerary, reservations, trips } from '$lib/db';
	import type { ChecklistItem, Flight, Reservation, Trip } from '$lib/db';
	import { t } from '$lib/i18n.svelte';
	import { ErrorState, Skeleton } from '$lib/components/ui';
	import { flagEmoji, formatDateRange, formatMoney } from '$lib/format';
	import { renderMarkdown } from '$lib/markdown';
	import { DateTime } from 'luxon';
	import { Printer, ArrowLeft } from 'lucide-svelte';
	import { getLanguage } from '$lib/i18n.svelte';
	import { startLive } from '$lib/live';
	import { computeFlight } from '$lib/db/repositories/flights';

	const id = $derived(page.params.id ?? '');

	let trip = $state<Trip | null>(null);
	let timeline = $state<{
		days: itinerary.DayTimeline[];
		unscheduled: itinerary.DayTimeline;
	} | null>(null);
	let flightList = $state<Flight[]>([]);
	let resList = $state<Reservation[]>([]);
	let checkItems = $state<ChecklistItem[]>([]);
	let budget = $state<expenses.BudgetSummary | null>(null);
	let loaded = $state(false);
	let loadError = $state(false);

	async function loadAll(tripId: string) {
		if (!tripId) return;
		loadError = false;
		try {
			const [tr, tl, fl, rl, cl, b] = await Promise.all([
				trips.get(tripId),
				itinerary.tripTimeline(tripId),
				flights.byTrip(tripId),
				reservations.byTrip(tripId),
				checklist.byTrip(tripId),
				expenses.summary(tripId)
			]);
			trip = tr;
			timeline = tl;
			flightList = fl;
			resList = rl;
			checkItems = cl;
			budget = b;
		} catch {
			loadError = true;
		} finally {
			loaded = true;
		}
	}

	$effect(() => {
		const tripId = id;
		loadAll(tripId);
	});

	onMount(() => startLive(() => loadAll(id)));

	/*
	 * `html.app-printing` is what unlocks scrolling while a sheet is open — a
	 * sheet sets `document.documentElement.style.overflow = 'hidden'`, and a
	 * hidden-overflow document prints as a single clipped page. The class is
	 * removed again on `afterprint` so on-screen behaviour is unchanged.
	 */
	onMount(() => {
		const onBefore = () => document.documentElement.classList.add('app-printing');
		const onAfter = () => document.documentElement.classList.remove('app-printing');
		window.addEventListener('beforeprint', onBefore);
		window.addEventListener('afterprint', onAfter);
		return () => {
			window.removeEventListener('beforeprint', onBefore);
			window.removeEventListener('afterprint', onAfter);
		};
	});

	const homeCurrency = $derived(trip?.homeCurrency ?? 'EUR');
	const travelerCount = $derived(trip?.travelerCount ?? 1);
	const days = $derived(timeline?.days ?? []);
	const unscheduled = $derived(timeline?.unscheduled ?? null);

	/** Checklist grouped the way the checklist screen groups it, in first-seen order. */
	const checklistGroups = $derived.by(() => {
		const groups: { name: string; items: ChecklistItem[] }[] = [];
		for (const item of checkItems) {
			const name = item.group?.trim() || t('ungrouped');
			let group = groups.find((g) => g.name === name);
			if (!group) groups.push((group = { name, items: [] }));
			group.items.push(item);
		}
		for (const group of groups) group.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		return groups;
	});

	function dayLabel(date: string | null, title?: string): string {
		if (!date) return t('unscheduled_ideas');
		const dt = DateTime.fromISO(date, { locale: getLanguage() });
		const formatted = dt.isValid ? dt.toFormat('cccc, d LLLL yyyy') : date;
		return title ? `${formatted} — ${title}` : formatted;
	}

	function timeLabel(value?: string | null): string {
		return value ? value.slice(0, 5) : '';
	}

	/** Unscheduled items from both lanes, flattened: the ideas that never got a day. */
	const unscheduledItems = $derived(
		[
			...(unscheduled?.allDay ?? []),
			...(unscheduled?.timed ?? []).map((entry) => entry.item)
		].filter((item): item is NonNullable<typeof item> => Boolean(item))
	);

	/** The money string for one itinerary item, in its own currency. */
	function itemCost(item: itinerary.DayTimeline['allDay'][number]): string | null {
		if (item.estCost == null) return null;
		return formatMoney(item.estCost, item.currency || homeCurrency, { decimals: true });
	}
</script>

<svelte:head>
	<title>{trip?.title?.trim() || t('itinerary')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<!-- Screen-only toolbar. Everything in here is `.no-print`. -->
<div
	class="no-print sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg/90 px-4 py-2 backdrop-blur-md sm:-mx-6 sm:px-6"
>
	<a
		href={resolve('/trip/[id]/overview', { id })}
		class="inline-flex min-h-touch items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [&_svg]:size-4"
	>
		<ArrowLeft />
		{t('back_to_trip')}
	</a>
	<button
		type="button"
		onclick={() => window.print()}
		class="inline-flex min-h-touch items-center gap-2 rounded-md bg-primary-600 px-4 text-sm font-medium text-white shadow-soft transition-colors hover:bg-primary-700 active:scale-[0.97] [&_svg]:size-4"
	>
		<Printer />
		{t('print_or_pdf')}
	</button>
	<p class="w-full text-center text-xs text-ink-muted sm:w-auto sm:text-right">
		{t('print_hint')}
	</p>
</div>

{#if !loaded}
	<div class="space-y-4">
		<Skeleton class="h-10 w-2/3" />
		<Skeleton class="h-64 w-full rounded-lg" />
	</div>
{:else if loadError}
	<ErrorState
		title={t('could_not_load_trip')}
		description={t('could_not_load_trip_retry')}
		onretry={() => loadAll(id)}
	/>
{:else if trip}
	<!--
		The document. `text-ink` / `bg-surface` are theme tokens, and the print
		block in app.css pins them to black-on-white, so the same markup prints
		legibly whether or not dark mode is on.
	-->
	<article class="print-document mx-auto max-w-3xl text-ink">
		<!-- Cover -->
		<header class="border-b-2 border-ink/20 pb-5">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">
				{t('trip_itinerary')}
			</p>
			<h1 class="mt-2 font-serif text-3xl font-semibold leading-tight sm:text-4xl">
				{trip.title?.trim() || trip.destinations?.[0]?.name || 'Trip'}
			</h1>
			{#if trip.destinations?.length}
				<p class="mt-2 text-base text-ink-muted">
					{trip.destinations
						.map((d) => `${flagEmoji(d.country) ? flagEmoji(d.country) + ' ' : ''}${d.name}`)
						.join(' · ')}
				</p>
			{/if}
			<dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
				<div>
					<dt class="text-xs uppercase tracking-wide text-ink-muted">{t('dates')}</dt>
					<dd class="font-medium">
						{trip.startDate || trip.endDate
							? formatDateRange(trip.startDate, trip.endDate)
							: t('no_dates_yet')}
					</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-ink-muted">{t('travelers')}</dt>
					<dd class="font-medium">{travelerCount}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-ink-muted">{t('currency')}</dt>
					<dd class="font-medium">{homeCurrency}</dd>
				</div>
				<div>
					<dt class="text-xs uppercase tracking-wide text-ink-muted">{t('days')}</dt>
					<dd class="font-medium">{days.filter((d) => d.date).length}</dd>
				</div>
			</dl>
		</header>

		<!-- Budget -->
		{#if budget && (budget.spent > 0 || budget.budgetTotal != null)}
			<section class="mt-6">
				<h2 class="font-serif text-xl font-semibold">{t('costs')}</h2>
				<table class="mt-3 w-full border-collapse text-sm">
					<tbody>
						{#if budget.budgetTotal != null}
							<tr class="border-b border-border">
								<th scope="row" class="py-1.5 text-left font-medium text-ink-muted"
									>{t('budget_total')}</th
								>
								<td class="py-1.5 text-right tabular-nums"
									>{formatMoney(budget.budgetTotal, homeCurrency, { decimals: true })}</td
								>
							</tr>
						{/if}
						<tr class="border-b border-border">
							<th scope="row" class="py-1.5 text-left font-medium text-ink-muted">{t('spent')}</th>
							<td class="py-1.5 text-right tabular-nums"
								>{formatMoney(budget.spent, homeCurrency, { decimals: true })}</td
							>
						</tr>
						{#if budget.remaining != null}
							<tr class="border-b border-border">
								<th scope="row" class="py-1.5 text-left font-medium text-ink-muted"
									>{budget.remaining < 0 ? t('over_budget') : t('remaining')}</th
								>
								<td class="py-1.5 text-right tabular-nums"
									>{formatMoney(Math.abs(budget.remaining), homeCurrency, { decimals: true })}</td
								>
							</tr>
						{/if}
					</tbody>
				</table>
				{#if budget.missingRateCount > 0}
					<p class="mt-2 text-xs text-ink-muted">
						{budget.missingRateCount}
						{budget.missingRateCount === 1 ? t('cost_excluded_one') : t('costs_excluded_many')}
					</p>
				{/if}
			</section>
		{/if}

		<!-- Flights -->
		{#if flightList.length}
			<section class="page-break mt-8">
				<h2 class="font-serif text-xl font-semibold">{t('flights')}</h2>
				<ul class="mt-3 space-y-4">
					{#each flightList as flight (flight._id)}
						{@const computed = computeFlight(flight)}
						<li class="break-inside-avoid rounded border border-border p-3">
							<div class="flex items-baseline justify-between gap-3">
								<p class="font-semibold">{computed.route}</p>
								{#if flight.bookingRef}
									<p class="text-xs text-ink-muted">
										{t('booking_ref')} <span class="font-mono">{flight.bookingRef}</span>
									</p>
								{/if}
							</div>
							<table class="mt-2 w-full border-collapse text-xs">
								<thead>
									<tr class="border-b border-border text-left text-ink-muted">
										<th class="py-1 font-medium">{t('flights')}</th>
										<th class="py-1 font-medium">{t('from')}</th>
										<th class="py-1 font-medium">{t('departs')}</th>
										<th class="py-1 font-medium">{t('to')}</th>
										<th class="py-1 font-medium">{t('arrives')}</th>
									</tr>
								</thead>
								<tbody>
									{#each computed.segments as seg, i (i)}
										<tr class="border-b border-border/60">
											<td class="py-1.5 pr-2">
												{[seg.airline, seg.flightNumber].filter(Boolean).join(' ') || '—'}
												{#if seg.seat}<span class="text-ink-muted"> · {seg.seat}</span>{/if}
											</td>
											<td class="py-1.5 pr-2">
												{seg.from?.code ?? '—'}
												{#if seg.from?.city}<span class="text-ink-muted">
														{seg.from.city}</span
													>{/if}
											</td>
											<td class="py-1.5 pr-2 tabular-nums">
												{timeLabel(seg.departLocal)}
												{#if seg.departLocal}<span class="text-ink-muted">
														{DateTime.fromISO(seg.departLocal).toFormat('d LLL')}</span
													>{/if}
											</td>
											<td class="py-1.5 pr-2">
												{seg.to?.code ?? '—'}
												{#if seg.to?.city}<span class="text-ink-muted"> {seg.to.city}</span>{/if}
											</td>
											<td class="py-1.5 tabular-nums">
												{timeLabel(seg.arriveLocal)}
												{#if seg.arriveLocal}<span class="text-ink-muted">
														{DateTime.fromISO(seg.arriveLocal).toFormat('d LLL')}</span
													>{/if}
												{#if seg.arrivalDayOffset > 0}<span class="text-ink-muted">
														+{seg.arrivalDayOffset}</span
													>{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
							{#if computed.totalDurationMinutes != null}
								<p class="mt-1.5 text-xs text-ink-muted">
									{t('total_duration')}: {computed.segments
										.map((s) => s.durationText)
										.filter(Boolean)
										.join(' + ')}
								</p>
							{/if}
							{#if flight.cost != null}
								<p class="mt-1 text-xs text-ink-muted">
									{t('cost')}: {formatMoney(flight.cost, flight.currency || homeCurrency, {
										decimals: true
									})}
								</p>
							{/if}
							{#if flight.checkInUrl}
								<p class="mt-1 break-all text-xs">
									{t('check_in')}:
									<a href={flight.checkInUrl} rel="noopener noreferrer external"
										>{flight.checkInUrl}</a
									>
								</p>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Reservations -->
		{#if resList.length}
			<section class="page-break mt-8">
				<h2 class="font-serif text-xl font-semibold">{t('reservations')}</h2>
				<ul class="mt-3 space-y-3">
					{#each resList as res (res._id)}
						<li class="break-inside-avoid rounded border border-border p-3 text-sm">
							<div class="flex items-baseline justify-between gap-3">
								<p class="font-semibold">{res.name || t('reservation')}</p>
								{#if res.confirmation}
									<p class="text-xs text-ink-muted">
										{t('confirmation')} <span class="font-mono">{res.confirmation}</span>
									</p>
								{/if}
							</div>
							<p class="mt-0.5 text-xs text-ink-muted">
								{#if res.start}{DateTime.fromISO(res.start).toFormat('ccc d LLL yyyy, HH:mm')}{/if}
								{#if res.end}
									→ {DateTime.fromISO(res.end).toFormat('ccc d LLL yyyy, HH:mm')}
								{/if}
								{#if res.location?.name}
									· {res.location.name}{/if}
								{#if res.location?.address}
									· {res.location.address}{/if}
							</p>
							{#if res.contact?.phone || res.contact?.email || res.contact?.url}
								<p class="mt-1 break-all text-xs">
									{[res.contact?.phone, res.contact?.email, res.contact?.url]
										.filter(Boolean)
										.join(' · ')}
								</p>
							{/if}
							{#if res.cost != null}
								<p class="mt-1 text-xs text-ink-muted">
									{t('cost')}: {formatMoney(res.cost, res.currency || homeCurrency, {
										decimals: true
									})}
								</p>
							{/if}
							{#if res.notes}
								<div class="mt-1.5 text-xs text-ink-muted">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes all user text before adding allowlisted tags (see $lib/markdown.ts) -->
									{@html renderMarkdown(res.notes)}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Day by day -->
		{#if days.length}
			<section class="page-break mt-8">
				<h2 class="font-serif text-xl font-semibold">{t('itinerary')}</h2>
				<div class="mt-3 space-y-5">
					{#each days as day (day.date)}
						<div class="break-inside-avoid">
							<h3 class="border-b border-border pb-1 font-serif text-base font-semibold">
								{dayLabel(day.date, day.day?.title)}
							</h3>
							{#if day.day?.notes}
								<div class="mt-1 text-xs text-ink-muted">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes all user text before adding allowlisted tags (see $lib/markdown.ts) -->
									{@html renderMarkdown(day.day.notes)}
								</div>
							{/if}
							<ul class="mt-1.5 space-y-1 text-sm">
								{#each day.allDay as item (item._id)}
									<li class="flex gap-2">
										<span class="w-14 shrink-0 text-xs text-ink-muted">{t('all_day')}</span>
										<span class="min-w-0 flex-1">
											<span class="font-medium">{item.title}</span>
											{#if item.location?.name}<span class="text-ink-muted">
													· {item.location.name}</span
												>{/if}
											{#if item.notes}<span class="block text-xs text-ink-muted">{item.notes}</span
												>{/if}
										</span>
										{#if itemCost(item)}
											<span class="shrink-0 text-xs tabular-nums text-ink-muted"
												>{itemCost(item)}</span
											>
										{/if}
									</li>
								{/each}
								{#each day.timed as entry, i (entry.item?._id ?? `${entry.kind}-${i}`)}
									{#if entry.kind === 'item' && entry.item}
										<li class="flex gap-2">
											<span class="w-14 shrink-0 text-xs tabular-nums text-ink-muted"
												>{entry.item.allDay ? t('all_day') : timeLabel(entry.item.startTime)}</span
											>
											<span class="min-w-0 flex-1">
												<span class="font-medium">{entry.item.title}</span>
												{#if entry.item.location?.name}<span class="text-ink-muted">
														· {entry.item.location.name}</span
													>{/if}
												{#if entry.item.notes}<span class="block text-xs text-ink-muted"
														>{entry.item.notes}</span
													>{/if}
											</span>
											{#if itemCost(entry.item)}
												<span class="shrink-0 text-xs tabular-nums text-ink-muted"
													>{itemCost(entry.item)}</span
												>
											{/if}
										</li>
									{:else if entry.kind === 'flight' && entry.flight}
										<li class="flex gap-2">
											<span class="w-14 shrink-0 text-xs tabular-nums text-ink-muted"
												>{timeLabel(entry.flight.segment.departLocal)}</span
											>
											<span class="min-w-0 flex-1">
												<span class="font-medium">
													{entry.flight.segment.from?.code ?? '—'} →
													{entry.flight.segment.to?.code ?? '—'}
												</span>
												<span class="text-ink-muted">
													{[entry.flight.segment.airline, entry.flight.segment.flightNumber]
														.filter(Boolean)
														.join(' ')}</span
												>
											</span>
										</li>
									{:else if entry.kind === 'reservation' && entry.reservation}
										<li class="flex gap-2">
											<span class="w-14 shrink-0 text-xs tabular-nums text-ink-muted"
												>{timeLabel(entry.reservation.time)}</span
											>
											<span class="min-w-0 flex-1">
												<span class="font-medium"
													>{entry.reservation.reservation.name || t('reservation')}</span
												>
												{#if entry.reservation.reservation.confirmation}
													<span class="font-mono text-xs text-ink-muted">
														{entry.reservation.reservation.confirmation}</span
													>
												{/if}
											</span>
										</li>
									{/if}
								{/each}
							</ul>
							{#if day.todos.length}
								<p class="mt-1 text-xs text-ink-muted">
									{t('daily_todos')}: {day.todos.filter((x) => x.done).length}/{day.todos.length}
									·
									{day.todos
										.map((x) => x.text)
										.filter(Boolean)
										.join(', ')}
								</p>
							{/if}
							{#if day.subtotal.spent > 0}
								<p class="mt-1 text-right text-xs tabular-nums text-ink-muted">
									{t('day_subtotal')}: {formatMoney(day.subtotal.spent, homeCurrency, {
										decimals: true
									})}
								</p>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Unscheduled ideas -->
		{#if unscheduledItems.length}
			<section class="page-break mt-8">
				<h2 class="font-serif text-xl font-semibold">{t('unscheduled_ideas')}</h2>
				<ul class="mt-2 space-y-1 text-sm">
					{#each unscheduledItems as idea (idea._id)}
						<li>
							<span class="font-medium">{idea.title}</span>
							{#if idea.location?.name}<span class="text-ink-muted">
									· {idea.location.name}</span
								>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<!-- Checklist -->
		{#if checkItems.length}
			<section class="page-break mt-8">
				<h2 class="font-serif text-xl font-semibold">{t('checklist')}</h2>
				<div class="mt-3 grid gap-4 sm:grid-cols-2">
					{#each checklistGroups as group (group.name)}
						<div class="break-inside-avoid">
							<h3 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
								{group.name}
							</h3>
							<ul class="mt-1 space-y-0.5 text-sm">
								{#each group.items as item (item._id)}
									<li class="flex items-baseline gap-2">
										<!--
											A real checkbox box rather than a glyph: paper has no
											toggle, so the point of printing a checklist is to have
											something to tick with a pen. The state is still shown, by
											filling the box.
										-->
										<span
											class="mt-0.5 inline-block size-3 shrink-0 rounded-sm border border-ink/60"
											class:bg-ink={item.done}
											aria-hidden="true"
										></span>
										<span class={item.done ? 'text-ink-muted line-through' : ''}>
											{item.text}
											{#if item.quantity && item.quantity > 1}
												<span class="text-ink-muted">×{item.quantity}</span>
											{/if}
										</span>
										<span class="sr-only">{item.done ? t('done') : t('not_done')}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Trip notes -->
		{#if trip.notes?.trim()}
			<section class="page-break mt-8">
				<h2 class="font-serif text-xl font-semibold">{t('notes')}</h2>
				<div class="mt-2 text-sm">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes all user text before adding allowlisted tags (see $lib/markdown.ts) -->
					{@html renderMarkdown(trip.notes)}
				</div>
			</section>
		{/if}

		<footer class="mt-10 border-t border-border pt-3 text-xs text-ink-muted">
			{t('printed_from_itinera')}
		</footer>
	</article>
{/if}
