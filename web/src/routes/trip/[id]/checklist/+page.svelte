<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { checklist, trips } from '$lib/db';
  import type { ChecklistItem, Trip } from '$lib/db';
  import { eachDateInRange } from '$lib/db/datetime';
    import { BUILTIN_TEMPLATES } from '$lib/db/builtin-templates';
    import {
      Briefcase,
      CalendarDays,
      CheckCircle2,
      Compass,
      EyeOff,
      LayoutList,
      ListChecks,
      Luggage,
      MoreVertical,
      Plus,
      RotateCcw,
      ShoppingCart,
      Snowflake,
      Sparkles,
      SquarePlus,
      Sun,
      Trash2,
      Upload
    } from 'lucide-svelte';

    function getTemplateIcon(iconName?: string) {
      if (iconName === 'Sun') return Sun;
      if (iconName === 'Snowflake') return Snowflake;
      if (iconName === 'Compass') return Compass;
      if (iconName === 'Briefcase') return Briefcase;
      return Luggage;
    }

    async function quickApplyBuiltin(templateId: string) {
      try {
        const added = await checklist.applyTemplate(id, templateId, 'merge');
        toast.success(t('template_applied', { n: String(added) }));
        loadAll(id);
      } catch {
        toast.error(t('could_not_apply_template'));
      }
    }
  import { t } from '$lib/i18n.svelte';
  import { Badge, Button, EmptyState, ErrorState, MenuItem, Popover, ProgressBar, Skeleton, toast } from '$lib/components/ui';
  import {
    ApplyTemplateDialog,
    ChecklistGroup,
    ChecklistItemRow,
    ChecklistSheet,
    MoveToGroupDialog,
    SaveTemplateDialog
  } from '$lib/components/checklist';
  import { formatWeekdayDate } from '$lib/format';
  import { getTripShellContext } from '$lib/trip-context';
  import { startLive } from '$lib/live';
  import { cn } from '$lib/utils';

  const shell = getTripShellContext();
  const reloadSignal = shell.reloadSignal;
  const id = $derived(page.params.id ?? '');

  type View = 'group' | 'day' | 'buy';

  let loaded = $state(false);
  let loadError = $state(false);
  let everLoaded = false;
  let trip = $state<Trip | null>(null);
  let groupView = $state<checklist.ChecklistGroupView[]>([]);
  let dayView = $state<checklist.ChecklistDayView[]>([]);
  let buyItems = $state<ChecklistItem[]>([]);
  let prog = $state<{ done: number; total: number; fraction: number }>({
    done: 0,
    total: 0,
    fraction: 0
  });
  let dates = $state<string[]>([]);

  let view = $state<View>('group');
  let hideCompleted = $state(false);

  // Sheets & dialogs.
  let itemSheetOpen = $state(false);
  let itemSheetMode = $state<'create' | 'edit'>('create');
  let activeItem = $state<ChecklistItem | null>(null);
  let activeGroup = $state<string>('Packing');
  let moveDialogOpen = $state(false);
  let applyDialogOpen = $state(false);
  let saveDialogOpen = $state(false);
  let actionsMenuOpen = $state(false);

  const customGroups = $derived(groupView.map((g) => g.group));

  async function loadAll(tripId: string) {
    if (!tripId) return;
    try {
      const [t, gv, dv, bi, prg] = await Promise.all([
        trips.get(tripId),
        checklist.groups(tripId, { hideCompleted }),
        checklist.byDay(tripId),
        checklist.toBuy(tripId),
        checklist.progress(tripId)
      ]);
      trip = t;
      groupView = gv;
      dayView = dv;
      buyItems = bi;
      prog = prg;
      
      if (t?.startDate && t?.endDate) {
        dates = eachDateInRange(t.startDate, t.endDate);
      } else {
        dates = [];
      }
      everLoaded = true;
      loadError = false;
    } catch (e) {
      console.error(e);
      if (!everLoaded) loadError = true;
    } finally {
      loaded = true;
    }
  }

  $effect(() => {
    const tid = id;
    void $reloadSignal;
    loadAll(tid);
  });

  // Reload when hideCompleted changes
  $effect(() => {
    if (everLoaded) {
      loadAll(id);
    }
  });

  onMount(() => startLive(() => loadAll(page.params.id ?? '')));

  function retry() {
    loadError = false;
    loaded = false;
    loadAll(id);
  }

  function handleEdit(item: ChecklistItem) {
    activeItem = item;
    itemSheetMode = 'edit';
    itemSheetOpen = true;
  }

  function handleAdd(defaultGrp?: string) {
    activeItem = null;
    itemSheetMode = 'create';
    activeGroup = defaultGrp ?? 'Packing';
    itemSheetOpen = true;
  }

  function handleMoveGroup(item: ChecklistItem) {
    activeItem = item;
    moveDialogOpen = true;
  }

  async function doMoveGroup(group: string) {
    if (!activeItem) return;
    try {
      await checklist.moveToGroup(activeItem._id, group);
      toast.success(t('moved_item'));
      loadAll(id);
    } catch {
      toast.error(t('could_not_move_item'));
    }
  }

  async function toggleItem(item: ChecklistItem) {
    try {
      await checklist.toggle(item._id);
      loadAll(id);
    } catch {
      toast.error(t('could_not_toggle_item'));
    }
  }

  async function deleteItem(item: ChecklistItem) {
    try {
      await checklist.softDelete(item._id);
      toast.success(t('item_deleted'));
      loadAll(id);
    } catch {
      toast.error(t('could_not_delete_item'));
    }
  }

  async function resetList() {
    try {
      await checklist.resetChecks(id);
      toast.success(t('checklist_reset'));
      loadAll(id);
    } catch {
      toast.error(t('could_not_reset_checks'));
    }
  }

  async function cleanCompleted() {
    try {
      await checklist.cleanCompleted(id);
      toast.success(t('cleared_completed_items'));
      loadAll(id);
    } catch {
      toast.error(t('could_not_clear_completed'));
    }
  }

  const segClass = (active: boolean) =>
    cn(
      'inline-flex min-h-touch items-center rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer',
      active ? 'bg-surface text-ink shadow-soft' : 'text-ink-muted hover:text-ink'
    );
</script>

<svelte:head>
  <title>Checklist – Itinera</title>
</svelte:head>

{#if !loaded}
  <div class="space-y-4">
    <Skeleton class="h-10 w-full rounded-md" />
    <Skeleton class="h-8 w-48 rounded-md" />
    <Skeleton class="h-32 w-full rounded-md" />
    <Skeleton class="h-32 w-full rounded-md" />
  </div>
{:else if loadError}
  <ErrorState title={t('could_not_load_checklist')} onretry={retry} />
{:else}
  <div class="flex flex-col gap-4">
    <!-- Header Controls -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
      <nav
        class="inline-flex rounded-lg border border-border bg-surface-sunken p-1 text-sm"
        aria-label="Checklist view"
      >
        <button type="button" class={segClass(view === 'group')} onclick={() => view = 'group'}>
          {t('groups')}
        </button>
        <button type="button" class={segClass(view === 'day')} onclick={() => view = 'day'}>
          {t('days')}
        </button>
        <button type="button" class={segClass(view === 'buy')} onclick={() => view = 'buy'}>
          {t('to_buy')}
        </button>
      </nav>

      <div class="flex items-center gap-2">
        <label class="flex items-center gap-2 text-sm text-ink-muted cursor-pointer mr-2 select-none">
          <input
            type="checkbox"
            checked={hideCompleted}
            onchange={(e) => hideCompleted = e.currentTarget.checked}
            class="rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30"
          />
          <span>{t('hide_completed')}</span>
        </label>

        <Button onclick={() => handleAdd()}>
          <Plus class="size-4" /> {t('add_item')}
        </Button>

        <Popover bind:open={actionsMenuOpen} label={t('checklist_options')}>
          {#snippet trigger({ toggle, open })}
            <Button variant="secondary" onclick={toggle} aria-haspopup="true" aria-expanded={open}>
              {t('options_ellipsis')}
            </Button>
          {/snippet}
          <MenuItem icon={ListChecks} onclick={() => { actionsMenuOpen = false; applyDialogOpen = true; }}>
            {t('apply_template_ellipsis')}
          </MenuItem>
          <MenuItem icon={Upload} onclick={() => { actionsMenuOpen = false; saveDialogOpen = true; }}>
            {t('save_as_template_ellipsis')}
          </MenuItem>
          <MenuItem icon={RotateCcw} onclick={() => { actionsMenuOpen = false; resetList(); }}>
            {t('reset_checklist')}
          </MenuItem>
          <MenuItem icon={Trash2} tone="danger" onclick={() => { actionsMenuOpen = false; cleanCompleted(); }}>
            {t('clear_completed')}
          </MenuItem>
        </Popover>
      </div>
    </div>

    <!-- Progress bar -->
    {#if prog.total > 0}
      <div class="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <span class="text-sm font-medium text-ink shrink-0">{t('progress')}</span>
        <div class="flex-1">
          <ProgressBar value={prog.fraction} tone={prog.fraction === 1 ? 'success' : 'primary'} size="md" label={t('checklist_overall_progress')} />
        </div>
        <span class="text-sm tabular-nums text-ink-muted shrink-0">{prog.done}/{prog.total}</span>
      </div>
    {/if}

    <!-- Content Views -->
    {#if view === 'group'}
      {#if groupView.length > 0}
        <div class="flex flex-col gap-4">
          {#each groupView as grp (grp.group)}
            <ChecklistGroup
              group={grp}
              tripId={id}
              hideCompleted={hideCompleted}
              onedit={handleEdit}
              onmovegroup={handleMoveGroup}
              onchanged={() => loadAll(id)}
            />
          {/each}
        </div>
      {:else}
        <div class="flex flex-col gap-6">
          <div class="rounded-xl border border-border bg-surface p-6 text-center shadow-xs">
            <div class="mx-auto grid size-12 place-items-center rounded-full bg-primary-100 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400">
              <ListChecks class="size-6" />
            </div>
            <h2 class="mt-3 font-serif text-xl font-semibold text-ink">{t('start_your_checklist')}</h2>
            <p class="mt-1 text-sm text-ink-muted max-w-md mx-auto">
              {t('start_checklist_desc')}
            </p>
            <div class="mt-4 flex flex-wrap items-center justify-center gap-3">
              <Button onclick={() => handleAdd()}>
                <Plus class="size-4" /> {t('add_custom_item')}
              </Button>
              <Button variant="secondary" onclick={() => (applyDialogOpen = true)}>
                {t('browse_all_templates')}
              </Button>
            </div>
          </div>

          <!-- Quick Templates Grid -->
          <div>
            <div class="flex items-center justify-between mb-3 px-1">
              <h3 class="text-sm font-semibold text-ink uppercase tracking-wider">{t('recommended_templates')}</h3>
              <span class="text-xs text-ink-muted">{t('one_click_setup')}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {#each BUILTIN_TEMPLATES as tpl (tpl._id)}
                {@const IconComponent = getTemplateIcon(tpl.iconName)}
                <div class="flex flex-col justify-between rounded-lg border border-border bg-surface p-4 transition-all hover:border-primary-500/50 hover:shadow-sm">
                  <div>
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2">
                        <div class="grid size-8 place-items-center rounded-md bg-surface-sunken text-primary-600 dark:text-primary-400">
                          <IconComponent class="size-4" />
                        </div>
                        <h4 class="font-medium text-ink text-sm">{tpl.name}</h4>
                      </div>
                      {#if tpl.isDefault}
                        <Badge variant="primary" class="text-[10px]">{t('popular')}</Badge>
                      {/if}
                    </div>
                    <p class="mt-2 text-xs text-ink-muted line-clamp-2 leading-relaxed">
                      {tpl.description}
                    </p>
                  </div>
                  <div class="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
                    <span class="text-xs text-ink-muted font-mono">{t('items_count_plural', { n: String(tpl.items?.length ?? 0) })}</span>
                    <Button variant="secondary" size="sm" onclick={() => quickApplyBuiltin(tpl._id!)}>
                      {t('use_template')}
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    {:else if view === 'day'}
      {#if dayView.length > 0}
        <div class="flex flex-col gap-4">
          {#each dayView as day (day.date)}
            <section class="rounded-lg border border-border bg-surface p-4">
              <h2 class="font-serif text-base font-semibold text-ink border-b border-border/60 pb-2 mb-3">
                {formatWeekdayDate(day.date)}
              </h2>
              <ul class="divide-y divide-border">
                {#each day.items as item (item._id)}
                  <ChecklistItemRow
                    {item}
                    tripId={id}
                    ontoggle={toggleItem}
                    onedit={handleEdit}
                    onmovegroup={handleMoveGroup}
                    ondelete={deleteItem}
                  />
                {/each}
              </ul>
            </section>
          {/each}
        </div>
      {:else}
        <EmptyState
          title={t('no_daily_todos')}
          description={t('no_daily_todos_desc')}
        />
      {/if}
    {:else if view === 'buy'}
      {#if buyItems.length > 0}
        <section class="rounded-lg border border-border bg-surface p-4">
          <ul class="divide-y divide-border">
            {#each buyItems as item (item._id)}
              <ChecklistItemRow
                {item}
                tripId={id}
                large
                ontoggle={toggleItem}
                onedit={handleEdit}
                onmovegroup={handleMoveGroup}
                ondelete={deleteItem}
              />
            {/each}
          </ul>
        </section>
      {:else}
        <EmptyState
          title={t('no_shopping_items')}
          description={t('no_shopping_items_desc')}
        />
      {/if}
    {/if}
  </div>
{/if}

<!-- Dialogs & Sheets -->
<ChecklistSheet
  bind:open={itemSheetOpen}
  mode={itemSheetMode}
  tripId={id}
  item={activeItem}
  defaultGroup={activeGroup}
  groups={customGroups}
  {dates}
  onsaved={() => loadAll(id)}
/>

<MoveToGroupDialog
  bind:open={moveDialogOpen}
  current={activeItem?.group}
  groups={customGroups}
  title={activeItem?.text}
  onmove={doMoveGroup}
/>

<ApplyTemplateDialog
  bind:open={applyDialogOpen}
  tripId={id}
  onapplied={() => loadAll(id)}
/>

<SaveTemplateDialog
  bind:open={saveDialogOpen}
  tripId={id}
  suggestedName={trip?.title ? `${trip.title} checklist` : undefined}
  onsaved={() => loadAll(id)}
/>