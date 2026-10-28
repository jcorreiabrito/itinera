<script lang="ts" module>
	let nextId = 0;
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { ResolvedPathname } from '$app/types';
	import { CornerDownLeft, Search } from 'lucide-svelte';
	import {
		groupCommands,
		matchCommands,
		orderByRecents,
		tripCommandId,
		tripCommands,
		tripSectionCommands,
		type Command,
		type CommandAction,
		type CommandGroup
	} from '$lib/command';
	import { bareTripUid, trips } from '$lib/db';
	import { tripRangeLabel } from '$lib/format';
	import { getLanguage, setLanguage, t, type TranslationKey } from '$lib/i18n.svelte';
	import { theme } from '$lib/stores/theme.svelte';
	import { TRIP_SECTIONS } from '$lib/trip-sections';
	import { cn } from '$lib/utils';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const uid = ++nextId;
	const listId = `command-list-${uid}`;
	const optionId = (index: number) => `${listId}-option-${index}`;

	const GROUP_LABELS: Record<CommandGroup, TranslationKey> = {
		trips: 'command_group_trips',
		trip: 'command_group_trip',
		actions: 'command_group_actions'
	};

	const RECENTS_KEY = 'itinera_command_recents';
	const MAX_RECENTS = 8;

	let dialogEl = $state<HTMLDialogElement>();
	let inputEl = $state<HTMLInputElement>();
	let query = $state('');
	let activeIndex = $state(0);
	let allTrips = $state<trips.TripWithDerived[]>([]);
	let recentIds = $state<string[]>([]);
	/** The element that had focus when the palette opened, restored when it closes. */
	let returnFocus: HTMLElement | null = null;

	function readRecents(): string[] {
		try {
			const raw = globalThis.localStorage?.getItem(RECENTS_KEY);
			if (!raw) return [];
			const parsed: unknown = JSON.parse(raw);
			if (!Array.isArray(parsed)) return [];
			return parsed
				.filter((entry): entry is string => typeof entry === 'string')
				.slice(0, MAX_RECENTS);
		} catch {
			return [];
		}
	}

	function remember(id: string) {
		recentIds = [id, ...recentIds.filter((entry) => entry !== id)].slice(0, MAX_RECENTS);
		try {
			globalThis.localStorage?.setItem(RECENTS_KEY, JSON.stringify(recentIds));
		} catch {
			/* storage is a convenience: without it the palette simply has no recents */
		}
	}

	onMount(() => {
		recentIds = readRecents();
	});

	async function loadTrips() {
		try {
			allTrips = await trips.list();
		} catch {
			// Actions still work when the trip list cannot be read; a toast here
			// would fire on every open for a problem the palette cannot fix.
			allTrips = [];
		}
	}

	$effect(() => {
		if (open) void loadTrips();
	});

	const currentTripId = $derived(page.params.id ?? '');

	const commands = $derived.by<Command[]>(() => {
		const searched = query.trim().length > 0;
		const recent = new Set(recentIds);
		// An empty query offers the trips you were just in, not every trip ever:
		// the full list is one keystroke away and would bury the actions.
		const tripSource = searched
			? allTrips
			: allTrips.filter((trip) => recent.has(tripCommandId(bareTripUid(trip._id))));

		const list = tripCommands(
			tripSource.map((trip) => ({
				id: bareTripUid(trip._id),
				title: trip.title?.trim() || t('untitled_trip'),
				hint: tripRangeLabel(trip),
				keywords: [
					...(trip.tags ?? []),
					...(trip.destinations ?? []).flatMap((destination) =>
						[destination.name, destination.country].filter(
							(value): value is string => typeof value === 'string' && value.length > 0
						)
					)
				]
			})),
			(id) => resolve('/trip/[id]/overview', { id })
		);

		if (currentTripId) {
			list.push(
				...tripSectionCommands(
					currentTripId,
					TRIP_SECTIONS.map((section) => ({
						id: section.id,
						label: t(section.labelKey),
						// The ids double as English search aliases while the UI is in
						// Portuguese (`costs` still finds "Custos").
						keywords: [section.id],
						href: section.path(currentTripId)
					}))
				),
				{
					id: `print:${currentTripId}`,
					group: 'trip',
					label: t('command_print'),
					keywords: ['print', 'pdf'],
					href: resolve('/trip/[id]/print', { id: currentTripId })
				}
			);
		}

		list.push(
			{
				id: 'action:new-trip',
				group: 'actions',
				label: t('command_new_trip'),
				href: `${resolve('/')}?new=1`
			},
			{
				id: 'action:settings',
				group: 'actions',
				label: t('command_settings'),
				href: resolve('/settings')
			},
			{
				id: 'action:data-safety',
				group: 'actions',
				label: t('command_data_safety'),
				keywords: ['backup', 'storage'],
				href: `${resolve('/settings')}#data-safety`
			},
			{
				id: 'action:trash',
				group: 'actions',
				label: t('command_trash'),
				keywords: ['deleted'],
				href: resolve('/settings/trash')
			},
			{
				id: 'action:conflicts',
				group: 'actions',
				label: t('command_conflicts'),
				keywords: ['sync', 'changes'],
				href: resolve('/settings/conflicts')
			},
			{
				id: 'action:toggle-theme',
				group: 'actions',
				label: t('command_toggle_theme'),
				keywords: ['dark', 'light'],
				action: 'toggle-theme'
			},
			{
				id: 'action:toggle-language',
				group: 'actions',
				label: t('command_toggle_language'),
				keywords: ['english', 'portuguese', 'idioma'],
				action: 'toggle-language'
			}
		);

		return list;
	});

	const matched = $derived(matchCommands(commands, query));
	const ordered = $derived(query.trim() ? matched : orderByRecents(matched, recentIds));
	const sections = $derived(groupCommands(ordered));

	const indexedSections = $derived.by(() => {
		let index = 0;
		return sections.map((section) => ({
			group: section.group,
			label: t(GROUP_LABELS[section.group]),
			commands: section.commands.map((command) => {
				const entry = { command, index };
				index += 1;
				return entry;
			})
		}));
	});

	const flat = $derived(
		indexedSections.flatMap((section) => section.commands.map((entry) => entry.command))
	);
	const activeCommand = $derived(
		activeIndex >= 0 && activeIndex < flat.length ? flat[activeIndex] : undefined
	);
	const activeOptionId = $derived(open && activeCommand ? optionId(activeIndex) : undefined);

	// Results shrink while the user types; keep the cursor on a real row.
	$effect(() => {
		if (activeIndex > flat.length - 1) activeIndex = Math.max(0, flat.length - 1);
	});

	$effect(() => {
		const el = dialogEl;
		if (!el) return;

		if (open) {
			if (!el.open) {
				returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
				el.showModal();
			}
			query = '';
			activeIndex = 0;
			void tick().then(() => inputEl?.focus());
		} else if (el.open) {
			el.close();
			const target = returnFocus;
			returnFocus = null;
			if (target?.isConnected) target.focus();
		}
	});

	// A modal should not scroll the page behind it. The previous value is kept
	// rather than cleared, so closing the palette over an open sheet leaves the
	// sheet's own scroll lock in place.
	$effect(() => {
		if (!open) return;
		const root = document.documentElement;
		const previous = root.style.overflow;
		root.style.overflow = 'hidden';
		return () => {
			root.style.overflow = previous;
		};
	});

	$effect(() => {
		const id = activeOptionId;
		if (!id) return;
		const option = document.getElementById(id);
		// jsdom, which the component tests run in, does not implement scrolling.
		if (option && typeof option.scrollIntoView === 'function') {
			option.scrollIntoView({ block: 'nearest' });
		}
	});

	function close() {
		open = false;
	}

	function move(delta: number) {
		if (flat.length === 0) return;
		activeIndex = (activeIndex + delta + flat.length) % flat.length;
	}

	function onInputKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			move(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			move(-1);
		} else if (event.key === 'Tab') {
			// Tab belongs to the combobox while it is open: focus stays in the
			// field and the active row moves, which is what a screen reader
			// following aria-activedescendant expects.
			event.preventDefault();
			move(event.shiftKey ? -1 : 1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (activeCommand) run(activeCommand);
		} else if (event.key === 'Home') {
			event.preventDefault();
			activeIndex = 0;
		} else if (event.key === 'End') {
			event.preventDefault();
			activeIndex = Math.max(0, flat.length - 1);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			close();
		}
	}

	function perform(action: CommandAction) {
		switch (action) {
			case 'toggle-theme':
				theme.set(theme.isDark ? 'light' : 'dark');
				break;
			case 'toggle-language':
				setLanguage(getLanguage() === 'en' ? 'pt-BR' : 'en');
				break;
		}
	}

	function run(command: Command) {
		remember(command.id);
		close();
		if (command.action) {
			perform(command.action);
			return;
		}
		if (command.href) void goto(command.href as ResolvedPathname);
	}
</script>

<!--
	The explicit role is part of this component's contract; <dialog> carries it
	implicitly, which is why the compiler's redundancy warning is silenced.
-->
<!-- svelte-ignore a11y_no_redundant_roles -->
<dialog
	bind:this={dialogEl}
	role="dialog"
	aria-modal="true"
	aria-label={t('command_title')}
	class="mx-auto mb-auto mt-[10vh] w-[calc(100vw-2rem)] max-w-xl rounded-xl border border-border bg-surface p-0 text-ink shadow-sheet backdrop:bg-ink/40 backdrop:backdrop-blur-sm open:animate-pop-in max-sm:mt-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:w-[min(92vw,36rem)]"
	oncancel={(event) => {
		event.preventDefault();
		close();
	}}
	onclick={(event) => {
		if (event.target === dialogEl) close();
	}}
>
	<div class="flex max-h-[min(70dvh,32rem)] flex-col">
		<div class="flex items-center gap-2 border-b border-border px-4">
			<Search class="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
			<input
				bind:this={inputEl}
				type="text"
				role="combobox"
				aria-expanded={open}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={activeOptionId}
				aria-label={t('command_search_label')}
				placeholder={t('command_search')}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				value={query}
				oninput={(event) => {
					query = event.currentTarget.value;
					activeIndex = 0;
				}}
				onkeydown={onInputKeydown}
				class="h-12 min-h-[44px] w-full bg-transparent text-base text-ink placeholder:text-ink-muted"
			/>
			<kbd
				class="hidden shrink-0 rounded border border-border bg-surface-sunken px-1.5 py-0.5 font-sans text-[11px] text-ink-muted sm:inline"
				aria-hidden="true">Esc</kbd
			>
		</div>

		<div
			id={listId}
			role="listbox"
			aria-label={t('command_results')}
			class="flex-1 overflow-y-auto overscroll-contain p-1"
		>
			{#if flat.length === 0}
				<p class="px-3 py-10 text-center text-sm text-ink-muted">{t('command_no_results')}</p>
			{:else}
				{#each indexedSections as section (section.group)}
					<div role="group" aria-labelledby={`${listId}-${section.group}`}>
						<div
							id={`${listId}-${section.group}`}
							class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
						>
							{section.label}
						</div>
						{#each section.commands as entry (entry.command.id)}
							<!--
								The combobox keeps focus and drives this row through
								aria-activedescendant, so the row itself needs no keyboard handler.
							-->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								id={optionId(entry.index)}
								role="option"
								tabindex="-1"
								aria-selected={entry.index === activeIndex}
								onmousedown={(event) => event.preventDefault()}
								onclick={() => run(entry.command)}
								onmousemove={() => (activeIndex = entry.index)}
								class={cn(
									'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm',
									entry.index === activeIndex
										? 'bg-primary-100 text-primary-700'
										: 'text-ink hover:bg-surface-sunken'
								)}
							>
								<span class="min-w-0 flex-1 truncate font-medium">{entry.command.label}</span>
								{#if entry.command.hint}
									<span
										class={cn(
											'shrink-0 text-xs',
											entry.index === activeIndex ? 'text-primary-700' : 'text-ink-muted'
										)}
									>
										{entry.command.hint}
									</span>
								{/if}
								{#if entry.index === activeIndex}
									<CornerDownLeft class="size-4 shrink-0" aria-hidden="true" />
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			{/if}
		</div>

		<div
			class="hidden items-center justify-between border-t border-border px-4 py-2 text-[11px] text-ink-muted sm:flex"
		>
			<span>{t('command_hint')}</span>
		</div>
	</div>
</dialog>
