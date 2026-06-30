<script lang="ts">
  import { onMount } from 'svelte';
  import { checklist, requestPersistentStorage, settings, storageEstimate, syncStatus } from '$lib/db';
  import { downloadAllExport, listBackups, runBackup, type BackupSummary } from '$lib/api';
  import { t, setLanguage, getLanguage, type Language } from '$lib/i18n.svelte';
  import {
    ArrowLeft,
    Database,
    Download,
    GitMerge,
    HardDrive,
    Pencil,
    RefreshCw,
    ShieldCheck,
    Star,
    Trash2,
    WifiOff
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

  const CURRENCIES = [
    'EUR', 'USD', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF',
    'MXN', 'BRL', 'CLP', 'RON', 'TRY', 'SGD', 'INR', 'AED', 'ZAR'
  ];

  const WEEK_START = [
    { v: 1, label: 'Monday' },
    { v: 0, label: 'Sunday' },
    { v: 6, label: 'Saturday' }
  ];

  let current = $state<Settings | null>(null);
  let homeCurrency = $state('EUR');
  let firstDayOfWeek = $state(1);
  let language = $state<Language>('en');
  let saving = $state(false);

  let templates = $state<ChecklistTemplate[]>([]);
  let renameOpen = $state(false);
  let renameId = $state('');
  let renameName = $state('');
  let renameSaving = $state(false);

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

  // `navigator.onLine` isn't reactive, so mirror it and combine with the sync
  // store: the export/backup controls run on the home server (doc 14 / NFR-5).
  let navOnline = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  const up = () => (navOnline = true);
  const down = () => (navOnline = false);
  $effect(() => {
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  });

  const online = $derived(navOnline && $syncStatus.state !== 'offline');

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
      toast.error('Could not list backups – is your home server reachable?', {
        action: { label: 'Retry', onClick: loadBackups }
      });
    } finally {
      loadingBackups = false;
    }
  }

  onMount(async () => {
    try {
      const s = await settings.get();
      current = s;
      homeCurrency = s.homeCurrencyDefault ?? 'EUR';
      firstDayOfWeek = s.firstDayOfWeek ?? 1;
      language = (s.language as Language) ?? 'en';
    } catch {
      toast.error('Could not load settings.');
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

  async function save() {
    saving = true;
    try {
      await settings.update({ homeCurrencyDefault: homeCurrency, firstDayOfWeek, language });
      setLanguage(language);
      toast.success(t('settings_saved'));
    } catch {
      toast.error('Could not save settings.');
    } finally {
      saving = false;
    }
  }

  async function makePersistent() {
    persisting = true;
    try {
      const granted = await requestPersistentStorage();
      persisted = granted;
      if (granted) toast.success('Storage is now persistent.');
      else toast.warning('The browser declined persistent storage for now.');
    } catch {
      toast.error('Could not request persistent storage.');
    } finally {
      persisting = false;
    }
  }

  async function exportAll() {
    if (!online || exporting) return;
    exporting = true;
    try {
      await downloadAllExport();
      toast.success('Full export downloaded.');
    } catch {
      toast.error('Could not export – is your home server reachable?', {
        action: { label: 'Retry', onClick: exportAll }
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
      toast.success(
        `Backed up ${result.docCount ?? 0} records${result.attachmentsWritten ? ` and ${result.attachmentsWritten} files` : ''}.`
      );
      await loadBackups();
    } catch {
      toast.error('Backup failed – is your home server reachable?', {
        action: { label: 'Retry', onClick: backupNow }
      });
    } finally {
      backingUp = false;
    }
  }

  async function setDefaultTemplate(id: string) {
    try {
      await checklist.templates.setDefault(id);
      await loadTemplates();
      toast.success('Default template set.');
    } catch {
      toast.error('Could not set the default template.');
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
      toast.success('Template renamed.');
    } catch {
      toast.error('Could not rename the template.');
    } finally {
      renameSaving = false;
    }
  }

  async function removeTemplate(t: ChecklistTemplate) {
    try {
      await checklist.templates.remove(t._id);
      await loadTemplates();
      toast.success('Template deleted.');
    } catch {
      toast.error('Could not delete the template.');
    }
  }
</script>

<header class="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
  <div class="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
    <div class="flex items-center gap-2">
      <a
        href="/"
        aria-label={t('back_to_trips')}
        class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 [&_svg]:size-5"
      >
        <ArrowLeft />
      </a>
      <h1 class="font-serif text-xl font-semibold">{t('settings_title')}</h1>
    </div>
    <SyncStatusPill />
  </div>
</header>

<main class="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
  <section class="rounded-lg border border-border bg-surface p-5">
    <h2 class="text-base font-semibold">{t('settings_title')}</h2>
    <p class="mt-1 text-sm text-ink-muted">{t('home_currency_desc')}</p>

    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <Field label={t('home_currency')} for="settings-currency">
        <Select
          id="settings-currency"
          value={homeCurrency}
          onchange={(e) => (homeCurrency = e.currentTarget.value)}
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
          onchange={(e) => (firstDayOfWeek = Number(e.currentTarget.value))}
        >
          {#each WEEK_START as day (day.v)}
            <option value={String(day.v)}>{day.label}</option>
          {/each}
        </Select>
      </Field>

      <Field label={t('language')} for="settings-language" class="sm:col-span-2">
        <Select
          id="settings-language"
          value={language}
          onchange={(e) => (language = e.currentTarget.value as Language)}
        >
          <option value="en">English</option>
          <option value="pt-BR">Português (Brasil)</option>
        </Select>
      </Field>
    </div>

    <div class="mt-5">
      <Button onclick={save} disabled={saving || !current}>
        {saving ? t('saving') : t('save')}
      </Button>
    </div>
  </section>

  <!-- Data & Backups (NFR-5: data ownership). These run on the home server. -->
  <section class="mt-4 rounded-lg border border-border bg-surface p-5">
    <div class="flex items-center gap-2">
      <Database class="size-4 text-primary-700" />
      <h2 class="text-base font-semibold">Data & backups</h2>
    </div>
    <p class="mt-1 text-sm text-ink-muted">
      Export your data or run a server-side backup. Your trips always live on your devices; these
      extras run on your home server.
    </p>

    {#if online}
      <div
        class="mt-4 flex items-start gap-2 rounded-md bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0"
      >
        <WifiOff />
        <span>You're online – these run on your home server.</span>
      </div>
    {/if}

    <div class="mt-4 flex flex-wrap gap-2">
      <Button variant="secondary" onclick={exportAll} disabled={!online || exporting}>
        <Download class="size-4" />
        {exporting ? 'Exporting…' : 'Export everything (JSON)'}
      </Button>
      <Button variant="secondary" onclick={backupNow} disabled={!online || backingUp}>
        <Database class="size-4" />
        {backingUp ? 'Backing up…' : 'Back up now'}
      </Button>
    </div>

    <div class="mt-5">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-ink">Recent backups</h3>
        {#if online}
          <button
            type="button"
            onclick={loadBackups}
            disabled={loadingBackups}
            class="-m-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-50 [&_svg]:size-3.5"
          >
            <RefreshCw class={loadingBackups ? 'animate-spin' : ''} /> Refresh
          </button>
        {/if}
      </div>
      {#if !online}
        <p class="mt-2 text-sm text-ink-muted">Connect to see your server backups.</p>
      {:else if loadingBackups && !backupsLoaded}
        <p class="mt-2 text-sm text-ink-muted">Loading…</p>
      {:else if backups.length === 0}
        <p class="mt-2 text-sm text-ink-muted">
          No backups yet – run "Back up now" to create your first.
        </p>
      {:else}
        <ul class="mt-2 divide-y divide-border rounded-md border border-border">
          {#each backups as b (b.name)}
            <li class="flex items-center justify-between gap-3 px-3 py-2.5">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-ink">
                  {b.createdAt ? relativeTime(b.createdAt) : b.name}
                </p>
                <p class="truncate text-xs text-ink-muted">
                  {b.docCount ?? 0} records · {formatBytes(b.sizeBytes ?? null)}
                </p>
              </div>
              <span class="shrink-0 font-mono text-[0.7rem] text-ink-muted">{b.name}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </section>

  <section class="mt-4 rounded-lg border border-border bg-surface p-5">
    <div class="flex items-center gap-2">
      <HardDrive class="size-4 text-primary-700" />
      <h2 class="text-base font-semibold">Storage</h2>
    </div>
    <p class="mt-1 text-sm text-ink-muted">
      Itinera keeps everything on this device so it works offline.
    </p>

    <div class="mt-4">
      <div class="flex items-center justify-between text-sm">
        <span class="flex text-ink-muted">On this device</span>
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

    <div class="mt-4 flex items-center gap-2">
      {#if persisted}
        <Badge variant="primary">
          <ShieldCheck class="size-3" /> Persistent storage on
        </Badge>
        <span class="text-xs text-ink-muted">The browser won't evict your data.</span>
      {:else}
        <Button variant="secondary" size="sm" onclick={makePersistent} disabled={persisting}>
          <ShieldCheck class="size-4" />
          {persisting ? 'Requesting…' : 'Make storage persistent'}
        </Button>
      {/if}
    </div>
  </section>

  <!-- Quick links to the data-ownership screens. -->
  <section class="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
    <a
      href="/settings/conflicts"
      class="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-sunken [&_svg]:size-5"
    >
      <GitMerge class="text-primary-700" />
      <span class="min-w-0 flex-1">
        <span class="block font-medium text-ink">Review changes</span>
        <span class="block text-sm text-ink-muted">See versions kept after offline edits.</span>
      </span>
    </a>
    <a
      href="/settings/trash"
      class="flex items-center gap-3 border-t border-border px-5 py-4 transition-colors hover:bg-surface-sunken [&_svg]:size-5"
    >
      <Trash2 class="text-ink-muted" />
      <span class="min-w-0 flex-1">
        <span class="block font-medium text-ink">Trash</span>
        <span class="block text-sm text-ink-muted">Restore deleted trips and items, or purge them.</span>
      </span>
    </a>
  </section>

  <section class="mt-4 rounded-lg border border-border bg-surface p-5">
    <h2 class="text-base font-semibold">Checklist templates</h2>
    <p class="mt-1 text-sm text-ink-muted">
      Reusable packing lists, to-do lists. The default is offered when you create a new trip. Save a
      template from any trip's checklist.
    </p>

    {#if templates.length === 0}
      <p class="mt-4 text-sm text-ink-muted">
        No templates yet – open a trip's checklist and choose "Save as template".
      </p>
    {:else}
      <ul class="mt-4 divide-y divide-border">
        {#each templates as t (t._id)}
          <li class="flex items-center gap-3 py-2.5">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate font-medium text-ink">{t.name ?? '(untitled)'}</span>
                {#if t.isDefault}
                  <Badge variant="primary">Default</Badge>
                {/if}
              </div>
              <p class="text-xs text-ink-muted">
                {t.items?.length ?? 0} item{t.items?.length !== 1 ? 's' : ''}
              </p>
            </div>
            {#if !t.isDefault}
              <Button variant="ghost" size="sm" onclick={() => setDefaultTemplate(t._id)}>
                <Star class="size-3.5" /> Set default
              </Button>
            {/if}
            <button
              type="button"
              onclick={() => openRename(t)}
              aria-label={`Rename ${t.name ?? 'template'}`}
              class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [&_svg]:size-4"
            >
              <Pencil />
            </button>
            <button
              type="button"
              onclick={() => removeTemplate(t)}
              aria-label={`Delete ${t.name ?? 'template'}`}
              class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger [&_svg]:size-4"
            >
              <Trash2 />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<Dialog bind:open={renameOpen} title="Rename template">
  <Field label="Template name" for="rename-template">
    <Input
      id="rename-template"
      value={renameName}
      placeholder="e.g. Beach trip"
      oninput={(e) => (renameName = e.currentTarget.value)}
    />
  </Field>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (renameOpen = false)} disabled={renameSaving}>
      Cancel
    </Button>
    <Button onclick={saveRename} disabled={renameSaving || !renameName.trim()}>
      {renameSaving ? 'Saving…' : 'Save'}
    </Button>
  {/snippet}
</Dialog>
