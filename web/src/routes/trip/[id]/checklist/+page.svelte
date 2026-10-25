<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { pushState, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { checklist, trash, trips } from '$lib/db';
	import type { ChecklistItem, Trip } from '$lib/db';
	import { eachDateInRange } from '$lib/db/datetime';
	import { BUILTIN_TEMPLATES } from '$lib/db/builtin-templates';
	import {
		Briefcase,
		Compass,
		ListChecks,
		Luggage,
		Plus,
		RotateCcw,
		Snowflake,
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
	import {
		Badge,
		Button,
		Dialog,
		EmptyState,
		ErrorState,
		MenuItem,
		Popover,
		ProgressBar,
		Skeleton,
		toast
	} from '$lib/components/ui';
	import {
		ApplyTemplateDialog,
		ChecklistGroup,
		ChecklistItemRow,
		ChecklistSheet,
		MoveToGroupDialog,
		SaveTemplateDialog
	} from '$lib/components/checklist';
	import { PackingDialog } from '$lib/components/packing';
	import { flagEnabled } from '$lib/config';
	import { formatWeekdayDate } from '$lib/format';
	import { getTripShellContext } from '$lib/trip-context';
	import { startLive } from '$lib/live';
	import { cn } from '$lib/utils';
	import { checklistUrl, readChecklistParams, type ChecklistView } from '$lib/utils/url-state';

	const shell = getTripShellContext();
	const reloadSignal = shell.reloadSignal;
	const id = $derived(page.params.id ?? '');

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

	/*
	 * Which view is on screen and whether completed items are hidden are part of
	 * "what the user is looking at", so the URL carries them: a shared or
	 * bookmarked link opens the same view, and a reload does not drop the user
	 * back on the default one. Read at initialisation rather than in an effect,
	 * so the first frame is already the linked view.
	 */
	const fromUrl = readChecklistParams(page.url.searchParams);
	let view = $state<ChecklistView>(fromUrl.view);
	let hideCompleted = $state(fromUrl.hideCompleted);

	/**
	 * The trip the URL's open item has been applied for, if any. Reactive, not a
	 * plain flag: the URL-sync effect below keys off it, and has to wake up when
	 * the first load for a trip finishes initialising.
	 */
	let initForId = $state('');

	// Sheets & dialogs.
	let itemSheetOpen = $state(false);
	let itemSheetMode = $state<'create' | 'edit'>('create');
	let activeItem = $state<ChecklistItem | null>(null);
	let activeGroup = $state<string>('Packing');
	let moveDialogOpen = $state(false);
	let applyDialogOpen = $state(false);
	let packingDialogOpen = $state(false);
	// Read once: a deployment switch is not reactive, and the entry points below
	// must disappear together.
	const packingEnabled = flagEnabled('packing');
	let saveDialogOpen = $state(false);
	let actionsMenuOpen = $state(false);
	let confirmResetOpen = $state(false);
	let confirmClearOpen = $state(false);

	const customGroups = $derived(groupView.map((g) => g.group));

	/** The URL this page owns, for the popstate guard in `onMount`. */
	const ownPath = $derived(resolve('/trip/[id]/checklist', { id }));

	/**
	 * Reopen the item a link points at.
	 *
	 * A reload — a phone reclaiming the tab, a shared link — should land the user
	 * back on the item they were editing. An id that no longer names a live item
	 * is ignored; the URL-sync effect drops it from the address bar on its first
	 * pass.
	 *
	 * Resolved against the loaded views rather than a fresh read: `groupView`
	 * hides completed items when the filter is on, but `byDay` and `toBuy` are
	 * unfiltered, so the item is usually found even then.
	 */
	function openItemByUrlId(itemId: string) {
		const target =
			groupView.flatMap((g) => g.items).find((i) => i._id === itemId) ??
			dayView.flatMap((d) => d.items).find((i) => i._id === itemId) ??
			buyItems.find((i) => i._id === itemId);
		if (!target) return;
		activeItem = target;
		itemSheetMode = 'edit';
		itemSheetOpen = true;
	}

	/**
	 * Take the view state from a query string.
	 *
	 * Used for Back/Forward, which move between the history entries the effect
	 * below pushes: by the time the event fires the browser is already on the
	 * other URL, so applying it here is what makes Back show the previous view
	 * instead of leaving the current one on screen.
	 */
	function applyUrlState(params: URLSearchParams) {
		const state = readChecklistParams(params);
		view = state.view;
		hideCompleted = state.hideCompleted;
		if (state.item) openItemByUrlId(state.item);
		// An edit sheet whose item the URL no longer names was closed by Back.
		else if (itemSheetMode === 'edit') itemSheetOpen = false;
	}

	async function loadAll(tripId: string, hide = hideCompleted) {
		if (!tripId) return;
		try {
			const [t, gv, dv, bi, prg] = await Promise.all([
				trips.get(tripId),
				checklist.groups(tripId, { hideCompleted: hide }),
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

			/*
			 * The item in the URL can only be resolved once the items are here.
			 *
			 * Wrapped in `untrack` because this runs inside the load effect:
			 * reading `page.url` — or the views `openItemByUrlId` scans — as a
			 * tracked dependency would tie the fetch to state it then writes.
			 */
			if (initForId !== tripId) {
				untrack(() => {
					const urlItem = readChecklistParams(page.url.searchParams).item;
					if (urlItem) openItemByUrlId(urlItem);
				});
				initForId = tripId;
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

	/*
	 * One load per navigation. The trip id and the shell's reload signal are the
	 * triggers, plus the hide-completed filter — an argument to
	 * `checklist.groups`, not a client-side filter, so changing it needs the
	 * refetch.
	 *
	 * This used to be two effects, the second calling `loadAll` again once an
	 * `everLoaded` flag the first one set was true: a second fetch per
	 * navigation, and a trap for whoever next made that flag reactive. One
	 * effect, with every trigger read in its own body, is the whole fix.
	 */
	$effect(() => {
		const tid = id;
		void $reloadSignal;
		loadAll(tid, hideCompleted);
	});

	/*
	 * Keep the address bar in step with what is on screen, so a view, the
	 * hide-completed filter and the open item can all be linked, bookmarked,
	 * shared and reloaded — the same shape as the itinerary's effect.
	 *
	 * The current URL is read from `window.location`, not from `page.url`: the
	 * latter would make this effect depend on its own writes, and the write
	 * would then have to be idempotent to terminate.
	 *
	 * A change *pushes* a history entry rather than replacing the current one,
	 * because Back is how a user undoes a filter they did not mean. The first
	 * pass replaces instead: it only normalises whatever the URL already said
	 * (a hand-edited view, an item that has since been deleted), which is not a
	 * user action and must not become a Back press of its own.
	 */
	let urlNormalised = false;
	$effect(() => {
		const tid = id;
		const nextView = view;
		const hide = hideCompleted;
		// Only an *existing* item has a URL of its own: the create sheet is a
		// transient form with nothing yet to point at.
		const item = itemSheetOpen && activeItem ? activeItem._id : null;
		// Nothing to mirror until the URL has been read for *this* trip, open
		// item and all.
		if (!tid || initForId !== tid) return;

		const next = checklistUrl(window.location.href, {
			view: nextView,
			hideCompleted: hide,
			item
		});
		const current = `${window.location.pathname}${window.location.search}`;
		if (next === current) {
			urlNormalised = true;
			return;
		}
		/*
		 * Built from the live location rather than a route literal, so the path is
		 * already the resolved one and `resolve()` has nothing to add.
		 */
		/* eslint-disable svelte/no-navigation-without-resolve */
		if (urlNormalised) pushState(next, {});
		else replaceState(next, {});
		/* eslint-enable svelte/no-navigation-without-resolve */
		urlNormalised = true;
	});

	onMount(() => {
		const stopLive = startLive(() => loadAll(page.params.id ?? ''));
		/*
		 * The pathname is checked before applying: a Back that leaves this page
		 * also fires here, and copying the next page's query string onto this
		 * page's state would mirror it straight back into the address bar,
		 * fighting the navigation already under way.
		 */
		const onPopstate = () => {
			if (window.location.pathname !== ownPath) return;
			applyUrlState(new URLSearchParams(window.location.search));
		};
		window.addEventListener('popstate', onPopstate);
		return () => {
			stopLive();
			window.removeEventListener('popstate', onPopstate);
		};
	});

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

	/*
	 * Deleting here is a soft delete — the item goes to the Trash — so the toast
	 * offers the same undo the Trash does, without the trip through Settings.
	 * An item deleted from a group inside a completed group is restored to the
	 * group it left, which `restore` already preserves.
	 */
	async function deleteItem(item: ChecklistItem) {
		try {
			await checklist.softDelete(item._id);
			toast.success(t('item_deleted'), {
				action: {
					label: t('undo'),
					onClick: async () => {
						try {
							await checklist.restore(item._id);
							loadAll(id);
						} catch {
							toast.error(t('could_not_restore'));
						}
					}
				}
			});
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

	/** The completed items cleared, remembered so the toast can put them back. */
	let lastCleared = $state<string[]>([]);

	async function cleanCompleted() {
		try {
			// `cleanCompleted` soft-deletes, so this is a move to the Trash, not a
			// purge — the copy in the dialog and the Undo action both say so.
			const cleared = await checklist.cleanCompleted(id);
			lastCleared = cleared;
			toast.success(t('cleared_completed_items'), {
				action: {
					label: t('undo'),
					onClick: async () => {
						try {
							await trash.restoreMany(lastCleared);
							loadAll(id);
						} catch {
							toast.error(t('could_not_restore'));
						}
					}
				}
			});
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
	<title>{t('checklist')} – Itinera</title>
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
	<div class="flex flex-col gap-4 pb-28">
		<!-- Header Controls -->
		<div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
			<nav
				class="inline-flex rounded-lg border border-border bg-surface-sunken p-1 text-sm"
				aria-label={t('checklist_view_label')}
			>
				<button type="button" class={segClass(view === 'group')} onclick={() => (view = 'group')}>
					{t('groups')}
				</button>
				<button type="button" class={segClass(view === 'day')} onclick={() => (view = 'day')}>
					{t('days')}
				</button>
				<button type="button" class={segClass(view === 'buy')} onclick={() => (view = 'buy')}>
					{t('to_buy')}
				</button>
			</nav>

			<div class="flex items-center gap-2">
				<label
					class="mr-2 flex cursor-pointer select-none items-center gap-2 text-sm text-ink-muted"
				>
					<input
						type="checkbox"
						checked={hideCompleted}
						onchange={(e) => (hideCompleted = e.currentTarget.checked)}
						class="rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30"
					/>
					<span>{t('hide_completed')}</span>
				</label>

				<Button onclick={() => handleAdd()}>
					<Plus class="size-4" />
					{t('add_item')}
				</Button>

				<Popover bind:open={actionsMenuOpen} label={t('checklist_options')}>
					{#snippet trigger({ toggle, open })}
						<Button variant="secondary" onclick={toggle} aria-haspopup="true" aria-expanded={open}>
							{t('options_ellipsis')}
						</Button>
					{/snippet}
					<MenuItem
						icon={ListChecks}
						onclick={() => {
							actionsMenuOpen = false;
							applyDialogOpen = true;
						}}
					>
						{t('apply_template_ellipsis')}
					</MenuItem>
					{#if packingEnabled}
						<MenuItem
							icon={Luggage}
							onclick={() => {
								actionsMenuOpen = false;
								packingDialogOpen = true;
							}}
						>
							{t('packing_option')}
						</MenuItem>
					{/if}
					<MenuItem
						icon={Upload}
						onclick={() => {
							actionsMenuOpen = false;
							saveDialogOpen = true;
						}}
					>
						{t('save_as_template_ellipsis')}
					</MenuItem>
					<MenuItem
						icon={RotateCcw}
						onclick={() => {
							actionsMenuOpen = false;
							confirmResetOpen = true;
						}}
					>
						{t('reset_checklist')}
					</MenuItem>
					<MenuItem
						icon={Trash2}
						tone="danger"
						onclick={() => {
							actionsMenuOpen = false;
							confirmClearOpen = true;
						}}
					>
						{t('clear_completed')}
					</MenuItem>
				</Popover>
			</div>
		</div>

		<!-- Progress bar -->
		{#if prog.total > 0}
			<div class="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
				<span class="shrink-0 text-sm font-medium text-ink">{t('progress')}</span>
				<div class="flex-1">
					<ProgressBar
						value={prog.fraction}
						tone={prog.fraction === 1 ? 'success' : 'primary'}
						size="md"
						label={t('checklist_overall_progress')}
					/>
				</div>
				<span class="shrink-0 text-sm tabular-nums text-ink-muted">{prog.done}/{prog.total}</span>
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
							{hideCompleted}
							onedit={handleEdit}
							onmovegroup={handleMoveGroup}
							onchanged={() => loadAll(id)}
						/>
					{/each}
				</div>
			{:else}
				<div class="flex flex-col gap-6">
					<div class="rounded-xl border border-border bg-surface p-6 text-center shadow-sm">
						<div
							class="mx-auto grid size-12 place-items-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400"
						>
							<ListChecks class="size-6" />
						</div>
						<h2 class="mt-3 font-serif text-xl font-semibold text-ink">
							{t('start_your_checklist')}
						</h2>
						<p class="mx-auto mt-1 max-w-md text-sm text-ink-muted">
							{t('start_checklist_desc')}
						</p>
						<div class="mt-4 flex flex-wrap items-center justify-center gap-3">
							<Button onclick={() => handleAdd()}>
								<Plus class="size-4" />
								{t('add_custom_item')}
							</Button>
							<Button variant="secondary" onclick={() => (applyDialogOpen = true)}>
								{t('browse_all_templates')}
							</Button>
							{#if packingEnabled}
								<Button variant="secondary" onclick={() => (packingDialogOpen = true)}>
									<Luggage class="size-4" />
									{t('packing_empty_cta')}
								</Button>
							{/if}
						</div>
					</div>

					<!-- Quick Templates Grid -->
					<div>
						<div class="mb-3 flex items-center justify-between px-1">
							<h3 class="text-sm font-semibold uppercase tracking-wider text-ink">
								{t('recommended_templates')}
							</h3>
							<span class="text-xs text-ink-muted">{t('one_click_setup')}</span>
						</div>
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{#each BUILTIN_TEMPLATES as tpl (tpl._id)}
								{@const IconComponent = getTemplateIcon(tpl.iconName)}
								<div
									class="flex flex-col justify-between rounded-lg border border-border bg-surface p-4 transition-all hover:border-primary-500/50 hover:shadow-sm"
								>
									<div>
										<div class="flex items-center justify-between gap-2">
											<div class="flex items-center gap-2">
												<div
													class="grid size-8 place-items-center rounded-md bg-surface-sunken text-primary-600 dark:text-primary-400"
												>
													<IconComponent class="size-4" />
												</div>
												<h4 class="text-sm font-medium text-ink">{tpl.name}</h4>
											</div>
											{#if tpl.isDefault}
												<Badge variant="primary" class="text-[10px]">{t('popular')}</Badge>
											{/if}
										</div>
										<p class="mt-2 line-clamp-2 text-xs leading-relaxed text-ink-muted">
											{tpl.description}
										</p>
									</div>
									<div
										class="mt-4 flex items-center justify-between border-t border-border/50 pt-3"
									>
										<span class="font-mono text-xs text-ink-muted"
											>{t('items_count_plural', { n: String(tpl.items?.length ?? 0) })}</span
										>
										<Button
											variant="secondary"
											size="sm"
											onclick={() => quickApplyBuiltin(tpl._id!)}
										>
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
							<h2
								class="mb-3 border-b border-border/60 pb-2 font-serif text-base font-semibold text-ink"
							>
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
				<EmptyState title={t('no_daily_todos')} description={t('no_daily_todos_desc')} />
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
				<EmptyState title={t('no_shopping_items')} description={t('no_shopping_items_desc')} />
			{/if}
		{/if}
	</div>
{/if}

<!-- Floating add button (mobile) -->
{#if loaded}
	<button
		type="button"
		onclick={() => handleAdd()}
		aria-label={t('add_item')}
		class="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary-600 px-5 text-base font-medium text-white shadow-card transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg lg:bottom-8 lg:hidden [&_svg]:size-5"
	>
		<Plus />
		<span class="hidden sm:inline">{t('add_item')}</span>
	</button>
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

<ApplyTemplateDialog bind:open={applyDialogOpen} tripId={id} onapplied={() => loadAll(id)} />

<PackingDialog bind:open={packingDialogOpen} tripId={id} {trip} onadded={() => loadAll(id)} />

<SaveTemplateDialog
	bind:open={saveDialogOpen}
	tripId={id}
	suggestedName={trip?.title ? `${trip.title} checklist` : undefined}
	onsaved={() => loadAll(id)}
/>

<Dialog bind:open={confirmResetOpen} title={t('reset_checklist')}>
	<p class="text-sm text-ink-muted">
		Are you sure you want to uncheck all items in this checklist?
	</p>
	<div class="mt-4 flex justify-end gap-2">
		<Button variant="ghost" onclick={() => (confirmResetOpen = false)}>{t('cancel')}</Button>
		<Button
			variant="destructive"
			onclick={() => {
				confirmResetOpen = false;
				resetList();
			}}
		>
			{t('reset_checklist')}
		</Button>
	</div>
</Dialog>

<Dialog bind:open={confirmClearOpen} title={t('clear_completed')}>
	<p class="text-sm text-ink-muted">{t('clear_completed_confirm')}</p>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (confirmClearOpen = false)}>{t('cancel')}</Button>
		<Button
			onclick={() => {
				confirmClearOpen = false;
				cleanCompleted();
			}}
		>
			{t('clear_completed')}
		</Button>
	{/snippet}
</Dialog>
