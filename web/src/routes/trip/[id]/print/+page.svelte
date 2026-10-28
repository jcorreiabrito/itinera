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
	 * The query string is the same contract the export center builds with
	 * `printHref`: `doc` selects the sections, `paper` the sheet, `lang` the
	 * dictionary (and the language handed to the server PDF link).
	 *
	 * The cover is the sheet a check-in desk reads: stored references, addresses
	 * and phones, plus QR codes drawn locally by `qrcode` as data URIs, so
	 * nothing is fetched when the page loads or when the paper prints.
	 *
	 * Layout is decided by `@media print` in `src/app.css` plus the helpers it
	 * exposes: `.no-print` for chrome that must not reach paper, `.page-break` for
	 * the major sections that should start a new sheet, and the `print-document`
	 * paper profiles (A4 by default, `.paper-letter` for US Letter).
	 */
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { page } from '$app/state';
	import { checklist, expenses, flights, itinerary, reservations, trips } from '$lib/db';
	import type { ChecklistItem, Flight, Reservation, Trip } from '$lib/db';
	import { getLanguage, setLanguage, t } from '$lib/i18n.svelte';
	import type { Language, TranslationKey } from '$lib/i18n.svelte';
	import { ErrorState, Select, Skeleton } from '$lib/components/ui';
	import { flagEmoji, formatMoney, tripRangeLabel } from '$lib/format';
	import { renderMarkdown } from '$lib/markdown';
	import { DateTime } from 'luxon';
	import { ArrowLeft, Download, Printer } from 'lucide-svelte';
	import { getApiUrl } from '$lib/api';
	import {
		pdfFilename,
		printHref,
		tripPdfPath,
		type ExportDocId,
		type PaperSize
	} from '$lib/export-center';
	import { startLive } from '$lib/live';
	import { computeFlight } from '$lib/db/repositories/flights';
	import { toDataURL } from 'qrcode';
	import { coverFacts, qrCodes, type PrintQrImage } from '$lib/print-extras';
	import CoverExtras from '$lib/components/print/CoverExtras.svelte';
	import ChecklistSheet from '$lib/components/print/ChecklistSheet.svelte';
	import CostsSheet from '$lib/components/print/CostsSheet.svelte';

	const id = $derived(page.params.id ?? '');

	/* The query contract, narrowed once so the rest of the file is typed. */
	function readDoc(value: string | null): ExportDocId {
		switch (value) {
			case 'itinerary':
			case 'costs':
			case 'checklist':
			case 'bookings':
				return value;
			default:
				return 'all';
		}
	}

	function readPaper(value: string | null): PaperSize {
		return value === 'letter' ? 'letter' : 'a4';
	}

	function readLanguage(value: string | null): Language | null {
		return value === 'en' || value === 'pt-BR' ? value : null;
	}

	const doc = $derived(readDoc(page.url.searchParams.get('doc')));
	const paper = $derived(readPaper(page.url.searchParams.get('paper')));
	const requestedLanguage = $derived(readLanguage(page.url.searchParams.get('lang')));
	/** The language the document is in: `?lang=` when given, the app's otherwise. */
	const lang = $derived(requestedLanguage ?? getLanguage());

	const DOC_TITLES: Record<ExportDocId, TranslationKey> = {
		all: 'print_doc_all',
		itinerary: 'print_doc_itinerary',
		costs: 'print_doc_costs',
		checklist: 'print_doc_checklist',
		bookings: 'print_doc_bookings'
	};

	/** Selector order: the whole booklet first, then the sections it contains. */
	const DOC_ORDER: readonly ExportDocId[] = ['all', 'itinerary', 'costs', 'checklist', 'bookings'];

	type SectionId =
		'costs' | 'flights' | 'reservations' | 'itinerary' | 'unscheduled' | 'checklist' | 'notes';

	const SECTION_TITLES: Record<SectionId, TranslationKey> = {
		costs: 'costs',
		flights: 'flights',
		reservations: 'reservations',
		itinerary: 'itinerary',
		unscheduled: 'unscheduled_ideas',
		checklist: 'checklist',
		notes: 'notes'
	};

	let trip = $state<Trip | null>(null);
	let timeline = $state<{
		days: itinerary.DayTimeline[];
		unscheduled: itinerary.DayTimeline;
	} | null>(null);
	let flightList = $state<Flight[]>([]);
	let resList = $state<Reservation[]>([]);
	let checkItems = $state<ChecklistItem[]>([]);
	let budget = $state<expenses.BudgetSummary | null>(null);
	let categoryBudget = $state<expenses.CategoryBudgetRow[]>([]);
	let qrImages = $state<PrintQrImage[]>([]);
	let loaded = $state(false);
	let loadError = $state(false);

	async function loadAll(tripId: string) {
		if (!tripId) return;
		loadError = false;
		try {
			const [tr, tl, fl, rl, cl, b, cb] = await Promise.all([
				trips.get(tripId),
				itinerary.tripTimeline(tripId),
				flights.byTrip(tripId),
				reservations.byTrip(tripId),
				checklist.byTrip(tripId),
				expenses.summary(tripId),
				expenses.byCategoryRollup(tripId)
			]);
			trip = tr;
			timeline = tl;
			flightList = fl;
			resList = rl;
			checkItems = cl;
			budget = b;
			categoryBudget = cb.categories;
			qrImages = await buildQrImages(fl, rl);
		} catch {
			loadError = true;
		} finally {
			loaded = true;
		}
	}

	/**
	 * Draw every cover code before the sheet renders.
	 *
	 * `toDataURL` is asynchronous, so the whole set is awaited here during page
	 * load and the cover then renders plain `<img>` tags: pressing Print never
	 * starts a job that could finish after the paper does. A code that fails to
	 * draw is dropped rather than failing the document.
	 */
	async function buildQrImages(
		flightRows: readonly Flight[],
		reservationRows: readonly Reservation[]
	): Promise<PrintQrImage[]> {
		const images = await Promise.all(
			qrCodes(flightRows, reservationRows).map(async (code) => {
				try {
					const dataUrl = await toDataURL(code.payload, {
						margin: 1,
						width: 240,
						errorCorrectionLevel: 'M'
					});
					return { ...code, dataUrl };
				} catch {
					return null;
				}
			})
		);
		return images.filter((image): image is PrintQrImage => image !== null);
	}

	$effect(() => {
		const tripId = id;
		loadAll(tripId);
	});

	onMount(() => startLive(() => loadAll(id)));

	const printPath = $derived(resolve('/trip/[id]/print', { id }));

	/** Navigate to the same document with a changed profile. */
	function updateQuery(next: { doc?: ExportDocId; paper?: PaperSize; lang?: Language }) {
		/*
		 * `printHref` prefixes the path `resolve()` produced above; the type
		 * assertion just tells the navigation lint what the builder already knows.
		 */
		void goto(
			printHref(printPath, {
				doc: next.doc ?? doc,
				paper: next.paper ?? paper,
				lang: next.lang ?? lang
			}) as ResolvedPathname,
			{ replaceState: true, noScroll: true }
		);
	}

	function onDocChange(event: Event & { currentTarget: HTMLSelectElement }) {
		updateQuery({ doc: readDoc(event.currentTarget.value) });
	}

	function onPaperChange(event: Event & { currentTarget: HTMLSelectElement }) {
		updateQuery({ paper: readPaper(event.currentTarget.value) });
	}

	function onLanguageChange(event: Event & { currentTarget: HTMLSelectElement }) {
		updateQuery({ lang: event.currentTarget.value === 'pt-BR' ? 'pt-BR' : 'en' });
	}

	/*
	 * `?lang=` is a property of the document, not of the app: a link shared as
	 * `?lang=pt-BR` must print Portuguese even when this device is in English.
	 * The effect reasserts the request if `initLanguage()` resolves after mount
	 * and overwrites the shared language, and `onDestroy` puts the device back
	 * the way it was. `leaving` stops the restore from being undone by a final
	 * effect run triggered by its own state change.
	 */
	let restoreLanguage: Language | null = null;
	let leaving = false;

	$effect(() => {
		const requested = requestedLanguage;
		if (leaving || !requested) return;
		const current = getLanguage();
		if (current === requested) return;
		if (restoreLanguage === null) restoreLanguage = current;
		setLanguage(requested);
	});

	onDestroy(() => {
		leaving = true;
		if (restoreLanguage) setLanguage(restoreLanguage);
	});

	/*
	 * `html.app-printing` is what unlocks scrolling while a sheet is open — a
	 * sheet sets `document.documentElement.style.overflow = 'hidden'`, and a
	 * hidden-overflow document prints as a single clipped page. The class is
	 * removed again on `afterprint` so on-screen behaviour is unchanged.
	 *
	 * `print-route` lets the print stylesheet drop the shell's paper-only trip
	 * header: this route has its own h1 and named page.
	 */
	onMount(() => {
		const root = document.documentElement;
		root.classList.add('print-route');
		const onBefore = () => root.classList.add('app-printing');
		const onAfter = () => root.classList.remove('app-printing');
		window.addEventListener('beforeprint', onBefore);
		window.addEventListener('afterprint', onAfter);
		return () => {
			window.removeEventListener('beforeprint', onBefore);
			window.removeEventListener('afterprint', onAfter);
			root.classList.remove('app-printing');
			root.classList.remove('print-route');
		};
	});

	const homeCurrency = $derived(trip?.homeCurrency ?? 'EUR');
	const travelerCount = $derived(trip?.travelerCount ?? 1);
	const days = $derived(timeline?.days ?? []);
	const unscheduled = $derived(timeline?.unscheduled ?? null);
	/** The check-in facts and QR captions the cover prints, from stored fields. */
	const coverData = $derived(coverFacts(flightList, resList));

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

	function dayLabel(day: itinerary.DayTimeline): string {
		let formatted: string;
		if (day.date) {
			const dt = DateTime.fromISO(day.date, { locale: getLanguage() });
			formatted = dt.isValid ? dt.toFormat('cccc, d LLLL yyyy') : day.date;
		} else if (day.ordinal != null) {
			formatted = t('day_n', { n: String(day.ordinal) });
		} else {
			formatted = t('unscheduled_ideas');
		}
		const title = day.day?.title;
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

	/*
	 * Presence and inclusion are separate booleans: a section can be part of the
	 * chosen document and still be empty, and an empty section must not print a
	 * heading. `visibleSections` is the document order both the body and the
	 * cover's contents list follow.
	 */
	const hasCosts = $derived(
		budget !== null &&
			(budget.spent > 0 ||
				budget.budgetTotal != null ||
				budget.missingRateCount > 0 ||
				categoryBudget.some((row) => row.cap != null))
	);
	const hasFlights = $derived(flightList.length > 0);
	const hasReservations = $derived(resList.length > 0);
	const hasItinerary = $derived(days.length > 0);
	const hasUnscheduled = $derived(unscheduledItems.length > 0);
	const hasChecklist = $derived(checkItems.length > 0);
	const hasNotes = $derived(Boolean(trip?.notes?.trim()));

	const showsCosts = $derived(hasCosts && (doc === 'all' || doc === 'costs'));
	const showsFlights = $derived(hasFlights && (doc === 'all' || doc === 'bookings'));
	const showsReservations = $derived(hasReservations && (doc === 'all' || doc === 'bookings'));
	const showsItinerary = $derived(hasItinerary && (doc === 'all' || doc === 'itinerary'));
	const showsUnscheduled = $derived(hasUnscheduled && (doc === 'all' || doc === 'itinerary'));
	const showsChecklist = $derived(hasChecklist && (doc === 'all' || doc === 'checklist'));
	const showsNotes = $derived(hasNotes && doc === 'all');

	const visibleSections = $derived.by(() => {
		const sections: SectionId[] = [];
		if (showsCosts) sections.push('costs');
		if (showsFlights) sections.push('flights');
		if (showsReservations) sections.push('reservations');
		if (showsItinerary) sections.push('itinerary');
		if (showsUnscheduled) sections.push('unscheduled');
		if (showsChecklist) sections.push('checklist');
		if (showsNotes) sections.push('notes');
		return sections;
	});

	/**
	 * A section starts a new sheet unless it is the first one on the sheet. The
	 * whole-trip booklet's first body section follows the cover, so every one of
	 * them breaks; a single-document print keeps its header and first section
	 * together. A hidden first section never leaves a break with nothing after it.
	 */
	function startsPage(section: SectionId): boolean {
		return doc === 'all' || visibleSections[0] !== section;
	}

	const serverPdfHref = $derived(id ? getApiUrl(tripPdfPath(id, lang)) : '');
</script>

<svelte:head>
	<title>{trip?.title?.trim() || t('untitled_trip')} – {t(DOC_TITLES[doc])}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<!-- Screen-only toolbar. Everything in here is `.no-print`. -->
<div
	class="no-print sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-bg/90 backdrop-blur-md sm:-mx-6"
>
	<div class="flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
		<a
			href={resolve('/trip/[id]/overview', { id })}
			class="inline-flex min-h-touch items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [&_svg]:size-4"
		>
			<ArrowLeft />
			{t('back_to_trip')}
		</a>
		<div class="flex flex-wrap items-center gap-2">
			{#if serverPdfHref}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- an API download, not an app route -->
				<a
					href={serverPdfHref}
					download={pdfFilename(id)}
					class="inline-flex min-h-touch items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [&_svg]:size-4"
				>
					<Download />
					{t('print_server_pdf')}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
			<button
				type="button"
				onclick={() => window.print()}
				class="inline-flex min-h-touch items-center gap-2 rounded-md bg-primary-600 px-4 text-sm font-medium text-white shadow-soft transition-colors hover:bg-primary-700 active:scale-[0.97] [&_svg]:size-4"
			>
				<Printer />
				{t('print_or_pdf')}
			</button>
		</div>
	</div>

	<div class="grid grid-cols-2 gap-3 border-t border-border px-4 py-3 sm:grid-cols-3 sm:px-6">
		<div>
			<label for="print-doc" class="mb-1 block text-xs font-medium text-ink-muted">
				{t('print_document')}
			</label>
			<Select id="print-doc" value={doc} onchange={onDocChange}>
				{#each DOC_ORDER as value (value)}
					<option {value}>{t(DOC_TITLES[value])}</option>
				{/each}
			</Select>
		</div>
		<div>
			<label for="print-paper" class="mb-1 block text-xs font-medium text-ink-muted">
				{t('print_paper')}
			</label>
			<Select id="print-paper" value={paper} onchange={onPaperChange}>
				<option value="a4">{t('print_paper_a4')}</option>
				<option value="letter">{t('print_paper_letter')}</option>
			</Select>
		</div>
		<div>
			<label for="print-lang" class="mb-1 block text-xs font-medium text-ink-muted">
				{t('export_center_language')}
			</label>
			<Select id="print-lang" value={lang} onchange={onLanguageChange}>
				<option value="en">{t('export_center_lang_en')}</option>
				<option value="pt-BR">{t('export_center_lang_pt')}</option>
			</Select>
		</div>
	</div>

	<p class="px-4 pb-2 text-center text-xs text-ink-muted sm:px-6 sm:text-right">
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
	<article
		class="print-document mx-auto max-w-3xl text-ink"
		class:paper-letter={paper === 'letter'}
	>
		{#if doc === 'all'}
			<!-- Cover page. Its contents list only names sections that will print. -->
			<div class="print-cover">
				<header class="border-b-2 border-ink/20 pb-5">
					<p class="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">
						{t('print_cover')}
					</p>
					<h1 class="mt-2 font-serif text-3xl font-semibold leading-tight sm:text-4xl">
						{trip.title?.trim() || trip.destinations?.[0]?.name || t('untitled_trip')}
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
								{trip.startDate || trip.endDate ? tripRangeLabel(trip) : t('no_dates_yet')}
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
							<dd class="font-medium">{days.length}</dd>
						</div>
					</dl>
				</header>

				<CoverExtras facts={coverData} codes={qrImages} />

				{#if visibleSections.length}
					<section class="mt-8" aria-labelledby="print-contents-heading">
						<h2 id="print-contents-heading" class="font-serif text-xl font-semibold">
							{t('print_contents')}
						</h2>
						<ol class="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
							{#each visibleSections as section (section)}
								<li>
									<a href={`#print-${section}`} class="hover:text-primary-700">
										{t(SECTION_TITLES[section])}
									</a>
								</li>
							{/each}
						</ol>
					</section>
				{/if}
			</div>
		{:else}
			<!-- A single document still carries the trip's identity on its first sheet. -->
			<header class="border-b-2 border-ink/20 pb-5">
				<p class="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">
					{t(DOC_TITLES[doc])}
				</p>
				<h1 class="mt-2 font-serif text-3xl font-semibold leading-tight sm:text-4xl">
					{trip.title?.trim() || trip.destinations?.[0]?.name || t('untitled_trip')}
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
							{trip.startDate || trip.endDate ? tripRangeLabel(trip) : t('no_dates_yet')}
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
						<dd class="font-medium">{days.length}</dd>
					</div>
				</dl>
			</header>
		{/if}

		<!-- Budget -->
		{#if showsCosts && budget}
			<section id="print-costs" class="mt-6" class:page-break={startsPage('costs')}>
				<h2 class="font-serif text-xl font-semibold">{t('costs')}</h2>
				<CostsSheet summary={budget} categories={categoryBudget} {homeCurrency} {travelerCount} />
			</section>
		{/if}

		<!-- Flights -->
		{#if showsFlights}
			<section id="print-flights" class="mt-8" class:page-break={startsPage('flights')}>
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
		{#if showsReservations}
			<section id="print-reservations" class="mt-8" class:page-break={startsPage('reservations')}>
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
		{#if showsItinerary}
			<section id="print-itinerary" class="mt-8" class:page-break={startsPage('itinerary')}>
				<h2 class="font-serif text-xl font-semibold">{t('itinerary')}</h2>
				<div class="mt-3 space-y-5">
					{#each days as day (day.key)}
						<div class="break-inside-avoid">
							<h3 class="border-b border-border pb-1 font-serif text-base font-semibold">
								{dayLabel(day)}
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
		{#if showsUnscheduled}
			<section id="print-unscheduled" class="mt-8" class:page-break={startsPage('unscheduled')}>
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
		{#if showsChecklist}
			<section id="print-checklist" class="mt-8" class:page-break={startsPage('checklist')}>
				<h2 class="font-serif text-xl font-semibold">{t('print_checklist_title')}</h2>
				<ChecklistSheet groups={checklistGroups} tearOff={doc === 'checklist'} />
			</section>
		{/if}

		<!-- Trip notes -->
		{#if showsNotes}
			<section id="print-notes" class="mt-8" class:page-break={startsPage('notes')}>
				<h2 class="font-serif text-xl font-semibold">{t('notes')}</h2>
				<div class="mt-2 text-sm">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes all user text before adding allowlisted tags (see $lib/markdown.ts) -->
					{@html renderMarkdown(trip.notes)}
				</div>
			</section>
		{/if}

		{#if visibleSections.length === 0}
			<p class="mt-8 text-sm text-ink-muted">{t('print_empty')}</p>
		{/if}

		<footer class="mt-10 border-t border-border pt-3 text-xs text-ink-muted">
			{t('printed_from_itinera')}
		</footer>
	</article>
{/if}
