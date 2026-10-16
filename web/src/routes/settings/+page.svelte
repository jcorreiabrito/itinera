<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		checklist,
		requestPersistentStorage,
		settings,
		storageEstimate,
		syncStatus
	} from '$lib/db';
	import { downloadAllExport, listBackups, runBackup, type BackupSummary } from '$lib/api';
	import { t, setLanguage, type Language, type TranslationKey } from '$lib/i18n.svelte';
	import {
		ArrowLeft,
		Database,
		Download,
		GitMerge,
		HardDrive,
		Pencil,
		RefreshCw,
		Server,
		ShieldCheck,
		Sparkles,
		Star,
		Trash2
	} from 'lucide-svelte';
	import {
		Badge,
		Button,
		Dialog,
		Field,
		Input,
		Select,
		SyncStatusPill,
		toast
	} from '$lib/components/ui';
	import { relativeTime } from '$lib/format';
	import type { ChecklistTemplate, Settings } from '$lib/db';
	import ItineraLogo from '$lib/components/brand/ItineraLogo.svelte';
	import IosStorageNotice from '$lib/components/ui/IosStorageNotice.svelte';

	const CURRENCIES = [
		'EUR',
		'USD',
		'GBP',
		'JPY',
		'CHF',
		'CAD',
		'AUD',
		'SEK',
		'NOK',
		'DKK',
		'PLN',
		'CZK',
		'HUF',
		'MXN',
		'BRL',
		'CLP',
		'RON',
		'TRY',
		'SGD',
		'INR',
		'AED',
		'ZAR'
	];

	// Keys, not strings: the option labels follow the active language.
	const WEEK_START: { v: number; key: TranslationKey }[] = [
		{ v: 1, key: 'weekday_monday' },
		{ v: 0, key: 'weekday_sunday' },
		{ v: 6, key: 'weekday_saturday' }
	];

	/** The settings fields this page writes; everything else in the doc is not ours. */
	type PageSettings = Pick<
		Settings,
		'homeCurrencyDefault' | 'firstDayOfWeek' | 'language' | 'cartoApiKey'
	>;

	let homeCurrency = $state('EUR');
	let firstDayOfWeek = $state(1);
	let language = $state<Language>('en');
	let cartoApiKey = $state('');

	/** The key as last written to the settings doc, so an unchanged field is not re-saved. */
	let savedCartoKey = '';
	let cartoKeyTimer: ReturnType<typeof setTimeout> | null = null;

	let templates = $state<ChecklistTemplate[]>([]);
	let renameOpen = $state(false);
	let renameId = $state('');
	let renameName = $state('');
	let renameSaving = $state(false);
	/** The template a delete is waiting on confirmation for. */
	let removeTarget = $state<ChecklistTemplate | null>(null);

	// Storage durability (doc 05).
	let usage = $state<number | null>(null);
	let quota = $state<number | null>(null);
	let persisted = $state(false);
	let persisting = $state(false);

	// Data & backups (server-backed; require connectivity).
	let backups = $state<BackupSummary[]>([]);
	let backupsLoaded = $state(false);
	let exporting = $state(false);
	let backingUp = $state(false);
	let loadingBackups = $state(false);

	import { network } from '$lib/stores/network.svelte';

	const online = $derived(
		network.isOnline && $syncStatus.state !== 'offline' && $syncStatus.state !== 'error'
	);

	async function loadTemplates() {
		try {
			templates = await checklist.templates.list();
		} catch {
			// non-fatal; templates simply won't list
		}
	}

	async function loadStorage() {
		try {
			const est = await storageEstimate();
			usage = est?.usage ?? null;
			quota = est?.quota ?? null;
		} catch {
			usage = null;
			quota = null;
		}
		try {
			persisted =
				typeof navigator !== 'undefined' && navigator.storage?.persisted
					? await navigator.storage.persisted()
					: false;
		} catch {
			persisted = false;
		}
	}

	async function loadBackups() {
		if (!online) return;
		loadingBackups = true;
		try {
			const res = await listBackups();
			backups = res.backups ?? [];
			backupsLoaded = true;
		} catch {
			backupsLoaded = false;
			toast.error(t('could_not_list_backups'), {
				action: { label: t('retry'), onClick: loadBackups }
			});
		} finally {
			loadingBackups = false;
		}
	}

	onMount(async () => {
		try {
			const s = await settings.get();
			homeCurrency = s.homeCurrencyDefault ?? 'EUR';
			firstDayOfWeek = s.firstDayOfWeek ?? 1;
			language = (s.language as Language) ?? 'en';
			cartoApiKey =
				s.cartoApiKey ??
				(typeof localStorage !== 'undefined'
					? (localStorage.getItem('itinera_carto_api_key') ?? '')
					: '');
			savedCartoKey = cartoApiKey.trim();
		} catch {
			toast.error(t('could_not_load_settings'));
		}
		await Promise.all([loadTemplates(), loadStorage()]);
		if (online) void loadBackups();
	});

	const currencyOptions = $derived(
		CURRENCIES.includes(homeCurrency) ? CURRENCIES : [homeCurrency, ...CURRENCIES]
	);

	const storagePct = $derived(
		usage != null && quota != null ? Math.min(100, Math.round((usage / quota) * 100)) : null
	);

	/*
	 * The newest server backup, for the data-safety panel. `listBackups` documents
	 * newest-first, but the panel is a claim about safety, so it picks the maximum
	 * itself rather than trusting the order (and tolerating entries with no date).
	 */
	const lastBackup = $derived(
		backups.reduce<BackupSummary | null>(
			(newest, b) => (!newest || (b.createdAt ?? '') > (newest.createdAt ?? '') ? b : newest),
			null
		)
	);

	/*
	 * `--` rather than "never" while the list has not loaded: offline we simply do
	 * not know whether a backup exists, and a false "never" would be alarming.
	 */
	const lastBackupLabel = $derived.by(() => {
		if (!lastBackup) return backupsLoaded ? t('data_safety_never') : '--';
		return relativeTime(lastBackup.createdAt ?? '') || lastBackup.name;
	});

	function formatBytes(n: number | null): string {
		if (n == null) return '--';
		if (n < 1024) return `${n} B`;
		const units = ['KB', 'MB', 'GB', 'TB'];
		let v = n / 1024;
		let i = 0;
		while (v >= 1024 && i < units.length - 1) {
			v /= 1024;
			i += 1;
		}
		return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
	}

	/**
	 * Every field on this page is written the moment it changes, and there is no
	 * Save button. That is deliberate. Every other settings surface already saves
	 * on change — the Trash retention select, the template dialogs, the theme
	 * toggle — so this page was the only place in the app where a *finished*
	 * interaction (a currency picked out of a list) could be silently thrown away
	 * by tapping the back arrow. It also mixed the two models: the language select
	 * saved itself while the fields above it waited for the button, so whether an
	 * edit survived a Back depended on which field it was in.
	 *
	 * `quiet` suppresses the success toast for the free-text field: it confirms
	 * itself by staying on screen, and a toast every time typing pauses is noise.
	 * A failure is never swallowed, in either case.
	 */
	async function persist(patch: Partial<PageSettings>, quiet = false): Promise<boolean> {
		try {
			await settings.update(patch);
			if (!quiet) toast.success(t('settings_saved'));
			return true;
		} catch {
			toast.error(t('could_not_save_settings'));
			return false;
		}
	}

	/** Writing per keystroke would put a document revision behind every character. */
	const CARTO_KEY_DEBOUNCE_MS = 400;

	function onCartoKeyInput(value: string) {
		cartoApiKey = value;
		if (cartoKeyTimer) clearTimeout(cartoKeyTimer);
		cartoKeyTimer = setTimeout(() => {
			cartoKeyTimer = null;
			void saveCartoKey();
		}, CARTO_KEY_DEBOUNCE_MS);
	}

	async function saveCartoKey() {
		const key = cartoApiKey.trim();
		if (key === savedCartoKey) return;
		if (await persist({ cartoApiKey: key }, true)) {
			savedCartoKey = key;
			// The map reads this straight from localStorage so it can style tiles
			// before the settings document has loaded.
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem('itinera_carto_api_key', key);
			}
		}
	}

	onDestroy(() => {
		// Navigating away inside the debounce window must not drop the edit — that
		// is the same silent loss this page was just rid of.
		if (cartoKeyTimer) {
			clearTimeout(cartoKeyTimer);
			cartoKeyTimer = null;
			void saveCartoKey();
		}
	});

	async function makePersistent() {
		persisting = true;
		try {
			const granted = await requestPersistentStorage();
			persisted = granted;
			if (granted) toast.success(t('storage_now_persistent'));
			else toast.warning(t('persistent_storage_declined'));
		} catch {
			toast.error(t('could_not_request_persistent'));
		} finally {
			persisting = false;
		}
	}

	async function exportAll() {
		if (!online || exporting) return;
		exporting = true;
		try {
			await downloadAllExport();
			toast.success(t('export_downloaded'));
		} catch {
			toast.error(t('could_not_export_server'), {
				action: { label: t('retry'), onClick: exportAll }
			});
		} finally {
			exporting = false;
		}
	}

	async function backupNow() {
		if (!online || backingUp) return;
		backingUp = true;
		try {
			const result = await runBackup();
			const records = String(result.docCount ?? 0);
			toast.success(
				result.attachmentsWritten
					? t('backup_done_files', { n: records, files: String(result.attachmentsWritten) })
					: t('backup_done', { n: records })
			);
			await loadBackups();
		} catch {
			toast.error(t('could_not_backup'), {
				action: { label: t('retry'), onClick: backupNow }
			});
		} finally {
			backingUp = false;
		}
	}

	async function setDefaultTemplate(id: string) {
		try {
			await checklist.templates.setDefault(id);
			await loadTemplates();
			toast.success(t('default_template_set'));
		} catch {
			toast.error(t('could_not_set_default_template'));
		}
	}

	function openRename(t: ChecklistTemplate) {
		renameId = t._id;
		renameName = t.name ?? '';
		renameOpen = true;
	}

	async function saveRename() {
		if (!renameName.trim()) return;
		renameSaving = true;
		try {
			await checklist.templates.update(renameId, { name: renameName.trim() });
			renameOpen = false;
			await loadTemplates();
			toast.success(t('template_renamed'));
		} catch {
			toast.error(t('could_not_rename_template'));
		} finally {
			renameSaving = false;
		}
	}

	async function forceAppUpdate() {
		try {
			if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
				const regs = await navigator.serviceWorker.getRegistrations();
				for (const reg of regs) {
					await reg.unregister();
				}
			}
			if (typeof window !== 'undefined' && 'caches' in window) {
				const keys = await caches.keys();
				for (const key of keys) {
					await caches.delete(key);
				}
			}
			toast.success(t('cache_cleared_reloading'));
			setTimeout(() => {
				window.location.reload();
			}, 500);
		} catch {
			window.location.reload();
		}
	}

	/** Confirmed. The removal is a soft delete, so the Trash is the backstop. */
	async function removeTemplate(tpl: ChecklistTemplate) {
		removeTarget = null;
		try {
			await checklist.templates.remove(tpl._id);
			await loadTemplates();
			toast.success(t('template_deleted'));
		} catch {
			toast.error(t('could_not_delete_template'));
		}
	}
</script>

<header class="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
	<div class="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
		<div class="flex items-center gap-2">
			<a
				href={resolve('/')}
				aria-label={t('back_to_trips')}
				class="grid size-11 min-h-[44px] min-w-[44px] place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 sm:size-9 sm:min-h-0 sm:min-w-0 [&_svg]:size-5"
			>
				<ArrowLeft />
			</a>
			<h1 class="font-serif text-xl font-semibold">{t('settings_title')}</h1>
		</div>
		<SyncStatusPill />
	</div>
</header>

<main id="page-content" class="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
	<section class="rounded-lg border border-border bg-surface p-5">
		<h2 class="text-base font-semibold">{t('settings_title')}</h2>
		<p class="mt-1 text-sm text-ink-muted">{t('home_currency_desc')}</p>

		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			<Field label={t('home_currency')} for="settings-currency">
				<Select
					id="settings-currency"
					value={homeCurrency}
					onchange={(e) => {
						const value = e.currentTarget.value;
						homeCurrency = value;
						void persist({ homeCurrencyDefault: value });
					}}
				>
					{#each currencyOptions as code (code)}
						<option value={code}>{code}</option>
					{/each}
				</Select>
			</Field>

			<Field label={t('first_day')} for="settings-week-start">
				<Select
					id="settings-week-start"
					value={String(firstDayOfWeek)}
					onchange={(e) => {
						const value = Number(e.currentTarget.value);
						firstDayOfWeek = value;
						void persist({ firstDayOfWeek: value });
					}}
				>
					{#each WEEK_START as day (day.v)}
						<option value={String(day.v)}>{t(day.key)}</option>
					{/each}
				</Select>
			</Field>

			<Field label={t('language')} for="settings-language" class="sm:col-span-2">
				<Select
					id="settings-language"
					value={language}
					onchange={(e) => {
						const value = e.currentTarget.value as Language;
						language = value;
						// Applied before the write: the whole page re-renders in the new
						// language, including the toast that confirms this change.
						setLanguage(value);
						void persist({ language: value });
					}}
				>
					<option value="en">English</option>
					<option value="pt-BR">Português (Brasil)</option>
				</Select>
			</Field>

			<div class="border-t border-border pt-4 sm:col-span-2">
				<Field label={t('carto_api_key')} for="settings-carto-key">
					<Input
						id="settings-carto-key"
						type="text"
						placeholder={t('carto_api_key_placeholder')}
						value={cartoApiKey}
						oninput={(e) => onCartoKeyInput(e.currentTarget.value)}
					/>
				</Field>
				<p class="mt-1.5 text-xs leading-relaxed text-ink-muted">
					{t('carto_api_key_desc')}
					<a
						href="https://carto.com/basemaps/apikey"
						target="_blank"
						rel="noopener noreferrer"
						class="ml-1 inline-flex items-center font-medium text-primary-700 underline hover:text-primary-800"
					>
						carto.com/basemaps/apikey ↗
					</a>
				</p>
			</div>
		</div>

		<!-- No Save button: every field above is written as it changes. -->
		<p class="mt-5 text-xs text-ink-muted">{t('settings_autosave_hint')}</p>
	</section>

	<!-- Data & Backups (NFR-5: data ownership). These run on the home server. -->
	<section class="mt-4 rounded-lg border border-border bg-surface p-5">
		<div class="flex items-center gap-2">
			<Database class="size-4 text-primary-700" />
			<h2 class="text-base font-semibold">{t('data_and_backups')}</h2>
		</div>
		<p class="mt-1 text-sm text-ink-muted">
			{t('data_and_backups_desc')}
		</p>

		{#if online}
			<!-- The hint says "you're online", so the icon must not be an offline one. -->
			<div
				class="mt-4 flex items-start gap-2 rounded-md bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0"
			>
				<Server />
				<span>{t('online_server_hint')}</span>
			</div>
		{/if}

		<div class="mt-4 flex flex-wrap gap-2">
			<Button variant="secondary" onclick={exportAll} disabled={!online || exporting}>
				<Download class="size-4" />
				{exporting ? t('exporting') : t('export_everything')}
			</Button>
			<Button variant="secondary" onclick={backupNow} disabled={!online || backingUp}>
				<Database class="size-4" />
				{backingUp ? t('backing_up') : t('backup_now')}
			</Button>
		</div>

		<p class="mt-2 text-xs leading-relaxed text-ink-muted">
			{t('export_json_records_only')}
			{t('backup_keeps_files')}
		</p>

		<div class="mt-5">
			<div class="flex items-center justify-between gap-2">
				<h3 class="text-sm font-semibold text-ink">{t('recent_backups')}</h3>
				{#if online}
					<button
						type="button"
						onclick={loadBackups}
						disabled={loadingBackups}
						class="-m-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-50 [&_svg]:size-3.5"
					>
						<RefreshCw class={loadingBackups ? 'animate-spin' : ''} />
						{t('refresh')}
					</button>
				{/if}
			</div>
			{#if !online}
				<p class="mt-2 text-sm text-ink-muted">{t('connect_see_backups')}</p>
			{:else if loadingBackups && !backupsLoaded}
				<p class="mt-2 text-sm text-ink-muted">{t('syncing')}</p>
			{:else if backups.length === 0}
				<p class="mt-2 text-sm text-ink-muted">
					{t('no_backups_yet')}
				</p>
			{:else}
				<ul class="mt-2 divide-y divide-border rounded-md border border-border">
					{#each backups as b (b.name)}
						<li
							class="flex flex-col justify-between gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
						>
							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-ink">
									{b.createdAt ? relativeTime(b.createdAt) : b.name}
								</p>
								<p class="truncate text-xs text-ink-muted">
									{t('records_count', { n: String(b.docCount ?? 0) })} · {formatBytes(
										b.sizeBytes ?? null
									)}
								</p>
							</div>
							<span
								class="max-w-full shrink-0 break-all font-mono text-[0.7rem] text-ink-muted sm:max-w-[12rem] sm:truncate sm:break-normal"
								>{b.name}</span
							>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>

	<section class="mt-4 rounded-lg border border-border bg-surface p-5">
		<div class="flex items-center gap-2">
			<HardDrive class="size-4 text-primary-700" />
			<h2 class="text-base font-semibold">{t('storage_durability')}</h2>
		</div>
		<p class="mt-1 text-sm text-ink-muted">
			{t('storage_device_desc')}
		</p>

		<IosStorageNotice />

		<div class="mt-4">
			<div class="flex items-center justify-between text-sm">
				<span class="flex text-ink-muted">{t('on_this_device')}</span>
				<span class="font-mono text-xs text-ink-muted">
					{formatBytes(usage)} / {formatBytes(quota)}
				</span>
			</div>
			{#if storagePct != null}
				<div class="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken">
					<div class="h-full rounded-full bg-primary-600" style={`width: ${storagePct}%`}></div>
				</div>
			{/if}
		</div>

		<div class="mt-4 flex flex-wrap items-center gap-2">
			{#if persisted}
				<Badge variant="primary">
					<ShieldCheck class="size-3" />
					{t('persistent_storage_on')}
				</Badge>
				<span class="text-xs text-ink-muted">{t('browser_wont_evict')}</span>
			{:else}
				<Button variant="secondary" size="sm" onclick={makePersistent} disabled={persisting}>
					<ShieldCheck class="size-4" />
					{persisting ? t('requesting') : t('persistent_storage')}
				</Button>
			{/if}

			<Button
				variant="ghost"
				size="sm"
				onclick={forceAppUpdate}
				class="text-ink-muted hover:text-ink"
			>
				<RefreshCw class="size-3.5" />
				{t('clear_cache_force_update')}
			</Button>
		</div>
	</section>

	<!--
		Data safety: the one place that answers "is my data safe right now?".
		It makes no network call of its own — every value is already loaded above,
		or comes from the sync store the header pill reads.
	-->
	<section class="mt-4 rounded-lg border border-border bg-surface p-5">
		<div class="flex items-center gap-2">
			<ShieldCheck class="size-4 text-primary-700" />
			<h2 class="text-base font-semibold">{t('data_safety_title')}</h2>
		</div>
		<p class="mt-1 text-sm text-ink-muted">{t('data_safety_desc')}</p>

		<ul class="mt-4 divide-y divide-border rounded-md border border-border">
			<li class="px-3 py-2.5">
				<div class="flex items-center justify-between gap-3">
					<span class="text-sm text-ink-muted">{t('data_safety_storage_label')}</span>
					<Badge variant={persisted ? 'primary' : 'warning'}>
						{t(persisted ? 'persistent_storage_on' : 'data_safety_storage_off')}
					</Badge>
				</div>
				<p class="mt-1 text-xs leading-relaxed text-ink-muted">
					{t(persisted ? 'browser_wont_evict' : 'data_safety_storage_off_desc')}
				</p>
			</li>

			<li class="px-3 py-2.5">
				<div class="flex items-center justify-between gap-3">
					<!-- The same count the header pill calls "pending". -->
					<span class="text-sm text-ink-muted">{t('unsynced_changes')}</span>
					<Badge variant={$syncStatus.pendingCount > 0 ? 'warning' : 'success'}>
						{$syncStatus.pendingCount}
					</Badge>
				</div>
				<p class="mt-1 text-xs leading-relaxed text-ink-muted">
					{t('data_safety_pending_desc')}
				</p>
			</li>

			<li class="px-3 py-2.5">
				<div class="flex items-center justify-between gap-3">
					<span class="text-sm text-ink-muted">{t('last_backup')}</span>
					<Badge variant="neutral">{lastBackupLabel}</Badge>
				</div>
				<p class="mt-1 text-xs leading-relaxed text-ink-muted">
					{backupsLoaded ? t('data_safety_backup_desc') : t('connect_see_backups')}
				</p>
			</li>
		</ul>
	</section>

	<!-- Quick links to the data-ownership screens. -->
	<section class="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
		<a
			href={resolve('/settings/conflicts')}
			class="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-sunken [&_svg]:size-5"
		>
			<GitMerge class="text-primary-700" />
			<span class="min-w-0 flex-1">
				<span class="block font-medium text-ink">{t('review_changes')}</span>
				<span class="block text-sm text-ink-muted">{t('review_changes_desc')}</span>
			</span>
		</a>
		<a
			href={resolve('/settings/trash')}
			class="flex items-center gap-3 border-t border-border px-5 py-4 transition-colors hover:bg-surface-sunken [&_svg]:size-5"
		>
			<Trash2 class="text-ink-muted" />
			<span class="min-w-0 flex-1">
				<span class="block font-medium text-ink">{t('trash')}</span>
				<span class="block text-sm text-ink-muted">{t('trash_desc')}</span>
			</span>
		</a>
	</section>

	<section class="mt-4 rounded-lg border border-border bg-surface p-5">
		<h2 class="text-base font-semibold">{t('checklist_templates')}</h2>
		<p class="mt-1 text-sm text-ink-muted">
			{t('checklist_templates_desc')}
		</p>

		{#if templates.length === 0}
			<p class="mt-4 text-sm text-ink-muted">
				{t('no_templates_yet')}
			</p>
		{:else}
			<ul class="mt-4 divide-y divide-border">
				{#each templates as tItem (tItem._id)}
					{@const isBuiltin = tItem._id.startsWith('tpl:builtin:')}
					<li class="flex items-center gap-3 py-2.5">
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="truncate font-medium text-ink">{tItem.name ?? t('untitled')}</span>
								{#if isBuiltin}
									<Badge variant="primary" class="gap-1 text-[10px]">
										<Sparkles class="size-3" />
										{t('builtin_template')}
									</Badge>
								{/if}
								{#if tItem.isDefault}
									<Badge variant="warning" class="text-[10px]">{t('default')}</Badge>
								{/if}
							</div>
							<p class="text-xs text-ink-muted">
								{tItem.items?.length === 1
									? t('items_count', { n: '1' })
									: t('items_count_plural', { n: String(tItem.items?.length ?? 0) })}
							</p>
						</div>
						{#if !tItem.isDefault}
							<Button variant="ghost" size="sm" onclick={() => setDefaultTemplate(tItem._id)}>
								<Star class="size-3.5" />
								{t('set_default')}
							</Button>
						{/if}
						{#if !isBuiltin}
							<button
								type="button"
								onclick={() => openRename(tItem)}
								aria-label={`${t('rename_template')} ${tItem.name ?? ''}`}
								class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [&_svg]:size-4"
							>
								<Pencil />
							</button>
							<button
								type="button"
								onclick={() => (removeTarget = tItem)}
								aria-label={`${t('delete')} ${tItem.name ?? ''}`}
								class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger [&_svg]:size-4"
							>
								<Trash2 />
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<footer class="mt-8 flex flex-col items-center justify-center gap-2 pb-6 text-center">
		<ItineraLogo size={28} withText />
		<p class="text-xs text-ink-muted">{t('app_tagline')}</p>
	</footer>
</main>

<Dialog bind:open={renameOpen} title={t('rename_template')}>
	<Field label={t('template_name')} for="rename-template">
		<Input
			id="rename-template"
			value={renameName}
			placeholder={t('template_name_placeholder')}
			oninput={(e) => (renameName = e.currentTarget.value)}
		/>
	</Field>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (renameOpen = false)} disabled={renameSaving}>
			{t('cancel')}
		</Button>
		<Button onclick={saveRename} disabled={renameSaving || !renameName.trim()}>
			{renameSaving ? t('saving') : t('save')}
		</Button>
	{/snippet}
</Dialog>

<Dialog
	open={removeTarget != null}
	title={t('delete_template_title', { name: removeTarget?.name ?? '' })}
	description={t('delete_template_body')}
	onclose={() => (removeTarget = null)}
>
	{#if removeTarget?.isDefault}
		<p class="text-sm text-ink-muted">{t('delete_template_default_note')}</p>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (removeTarget = null)}>{t('cancel')}</Button>
		<Button variant="destructive" onclick={() => removeTarget && removeTemplate(removeTarget)}>
			{t('delete')}
		</Button>
	{/snippet}
</Dialog>
