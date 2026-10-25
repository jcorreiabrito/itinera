<script lang="ts">
	import { Download, Printer } from 'lucide-svelte';
	import { getApiUrl } from '$lib/api';
	import { getLanguage, t, type Language, type TranslationKey } from '$lib/i18n.svelte';
	import type { IconComponent } from '$lib/types';
	import { Button, Card, Select } from '$lib/components/ui';
	import {
		pdfFilename,
		printHref,
		tripPdfPath,
		type ExportCountKey,
		type ExportCounts,
		type ExportDocDefinition,
		type PaperSize
	} from '$lib/export-center';

	interface Props {
		tripId: string;
		/** This trip's resolved `/trip/[id]/print` path. */
		printPath: string;
		doc: ExportDocDefinition;
		counts: ExportCounts;
		icon: IconComponent;
		/** Only the whole-trip booklet exists as a server-rendered PDF. */
		serverPdf?: boolean;
	}

	let { tripId, printPath, doc, counts, icon, serverPdf = false }: Props = $props();

	const COUNT_LABELS: Record<ExportCountKey, TranslationKey> = {
		days: 'export_center_count_days',
		items: 'export_center_count_items',
		expenses: 'export_center_count_expenses',
		checklist: 'export_center_count_checklist',
		flights: 'export_center_count_flights',
		reservations: 'export_center_count_reservations'
	};

	const Icon = $derived(icon);
	const paperId = $derived(`export-paper-${doc.id}`);
	const langId = $derived(`export-lang-${doc.id}`);

	// A4 is the printable route's default, and matches this app's @page rule.
	let paper = $state<PaperSize>('a4');
	// The document starts in the language the app is showing; changing it here
	// changes only the paper, not the screens.
	let lang = $state<Language>(getLanguage());

	const href = $derived(printHref(printPath, { doc: doc.id, paper, lang }));
	const serverHref = $derived(serverPdf ? getApiUrl(tripPdfPath(tripId, lang)) : null);

	/*
	 * Native `select` values are strings, so the two unions have to be narrowed
	 * here — the only place a DOM value crosses into the typed print options.
	 */
	function onPaperChange(event: Event & { currentTarget: HTMLSelectElement }) {
		paper = event.currentTarget.value === 'letter' ? 'letter' : 'a4';
	}

	function onLanguageChange(event: Event & { currentTarget: HTMLSelectElement }) {
		lang = event.currentTarget.value === 'pt-BR' ? 'pt-BR' : 'en';
	}
</script>

<Card class="flex h-full flex-col p-4 sm:p-5">
	<div class="flex items-start gap-3">
		<span
			class="grid size-10 shrink-0 place-items-center rounded-md bg-primary-100 text-primary-600 [&_svg]:size-5"
			aria-hidden="true"
		>
			<Icon />
		</span>
		<div class="min-w-0">
			<h3 class="font-serif text-lg font-semibold leading-tight">{t(doc.titleKey)}</h3>
			<p class="mt-1 text-sm text-ink-muted">{t(doc.descriptionKey)}</p>
		</div>
	</div>

	<div class="mt-4">
		<p class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
			{t('export_center_includes')}
		</p>
		<dl class="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
			{#each doc.counts as key (key)}
				<div class="flex items-baseline gap-1.5">
					<dt class="text-ink-muted">{t(COUNT_LABELS[key])}</dt>
					<dd class="font-medium tabular-nums">{counts[key]}</dd>
				</div>
			{/each}
		</dl>
	</div>

	<div class="no-print mt-auto pt-4">
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for={paperId} class="mb-1 block text-xs font-medium text-ink-muted">
					{t('export_center_paper')}
				</label>
				<Select id={paperId} value={paper} onchange={onPaperChange}>
					<option value="a4">{t('export_center_paper_a4')}</option>
					<option value="letter">{t('export_center_paper_letter')}</option>
				</Select>
			</div>
			<div>
				<label for={langId} class="mb-1 block text-xs font-medium text-ink-muted">
					{t('export_center_language')}
				</label>
				<Select id={langId} value={lang} onchange={onLanguageChange}>
					<option value="en">{t('export_center_lang_en')}</option>
					<option value="pt-BR">{t('export_center_lang_pt')}</option>
				</Select>
			</div>
		</div>

		<Button
			class="mt-3 w-full"
			{href}
			aria-label={t('export_center_print_doc', { document: t(doc.titleKey) })}
		>
			<Printer class="size-4" aria-hidden="true" />
			{t('export_center_print')}
		</Button>

		{#if serverHref}
			<p class="mt-3 text-xs text-ink-muted">{t('export_center_server_pdf_desc')}</p>
			<!-- eslint-disable svelte/no-navigation-without-resolve -- an API download, not an app route -->
			<a
				href={serverHref}
				download={pdfFilename(tripId)}
				class="mt-1 inline-flex min-h-touch items-center gap-1.5 text-sm font-medium text-primary-600 transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg [&_svg]:size-4"
			>
				<Download aria-hidden="true" />
				{t('export_center_server_pdf')}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	</div>
</Card>
