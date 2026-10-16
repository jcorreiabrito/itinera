<script lang="ts" module>
	export type SheetSide = 'bottom' | 'right';
	let nextId = 0;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import Button from './Button.svelte';

	interface Props {
		open?: boolean;
		side?: SheetSide;
		title?: string;
		description?: string;
		class?: string;
		closeLabel?: string;
		/**
		 * Set while the sheet holds edits that have not been saved. Every way out
		 * of the sheet then asks first — the close button, the backdrop, Escape and
		 * the swipe-down handle — because all four route through `requestClose()`.
		 */
		dirty?: boolean;
		discardTitle?: string;
		discardBody?: string;
		discardLabel?: string;
		keepEditingLabel?: string;
		onclose?: () => void;
		children: Snippet;
		footer?: Snippet;
	}

	let {
		open = $bindable(false),
		side = 'bottom',
		title,
		description,
		class: className,
		closeLabel = 'Close',
		dirty = false,
		discardTitle = 'Discard unsaved changes?',
		discardBody = 'Your edits will be lost.',
		discardLabel = 'Discard',
		keepEditingLabel = 'Keep editing',
		onclose,
		children,
		footer
	}: Props = $props();

	let dialogEl = $state<HTMLDialogElement>();
	let contentEl = $state<HTMLDivElement>();
	let confirmEl = $state<HTMLDivElement>();
	let closing = $state(false);
	let confirming = $state(false);

	let touchStartY = 0;
	let touchDiffY = $state(0);
	let isDragging = $state(false);

	const uid = ++nextId;
	const titleId = `sheet-title-${uid}`;
	const descId = `sheet-desc-${uid}`;
	const confirmTitleId = `sheet-confirm-title-${uid}`;
	const confirmBodyId = `sheet-confirm-body-${uid}`;

	$effect(() => {
		const el = dialogEl;
		if (!el) return;
		if (open && !el.open) {
			closing = false;
			el.showModal();
			if (typeof document !== 'undefined') {
				document.documentElement.style.overflow = 'hidden';
			}
		} else if (!open && el.open && !closing) {
			closing = true;
			if (typeof document !== 'undefined') {
				const openDialogs = document.querySelectorAll('dialog[open]');
				if (openDialogs.length <= 1) {
					document.documentElement.style.overflow = '';
				}
			}
			setTimeout(() => {
				el.close();
				closing = false;
			}, 220);
		}
		return () => {
			if (typeof document !== 'undefined') {
				const openDialogs = document.querySelectorAll('dialog[open]');
				if (openDialogs.length <= 1) {
					document.documentElement.style.overflow = '';
				}
			}
		};
	});

	/** Close for real: no prompt, no going back. */
	function close() {
		if (typeof document !== 'undefined') {
			const openDialogs = document.querySelectorAll('dialog[open]');
			if (openDialogs.length <= 1) {
				document.documentElement.style.overflow = '';
			}
		}
		open = false;
		onclose?.();
	}

	/**
	 * The one exit. A sheet holding unsaved edits shows the confirmation panel
	 * instead of closing, so a swipe or a stray Escape costs nothing.
	 */
	function requestClose() {
		if (confirming) {
			// A second dismissal gesture on the prompt itself means "keep editing".
			keepEditing();
			return;
		}
		if (dirty) {
			confirming = true;
			return;
		}
		close();
	}

	function keepEditing() {
		confirming = false;
	}

	function discardChanges() {
		confirming = false;
		close();
	}

	// The parent may save (or reset) the form while the prompt is up; the prompt
	// has nothing left to protect at that point.
	$effect(() => {
		if (confirming && !dirty) confirming = false;
	});

	// Focus the panel so the prompt is announced and Escape/Tab land somewhere
	// sensible. Focus goes to the panel, not to a button: the least destructive
	// action should be the default, and focusing "Discard" would make a stray
	// Enter throw the edits away.
	$effect(() => {
		if (confirming) confirmEl?.focus();
	});

	function onBackdropClick(event: MouseEvent) {
		if (event.target === dialogEl) requestClose();
	}

	function handleTouchStart(e: TouchEvent) {
		if (contentEl && contentEl.scrollTop > 0) return;
		touchStartY = e.touches[0].clientY;
		touchDiffY = 0;
		isDragging = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging) return;
		const currentY = e.touches[0].clientY;
		const diff = currentY - touchStartY;
		if (diff > 0) {
			touchDiffY = diff;
		} else {
			touchDiffY = 0;
		}
	}

	function handleTouchEnd() {
		if (!isDragging) return;
		isDragging = false;
		if (touchDiffY > 80) {
			requestClose();
		}
		touchDiffY = 0;
	}

	const sideClasses: Record<SheetSide, string> = {
		bottom:
			'm-auto mb-0 mt-auto w-full max-w-2xl rounded-t-xl rounded-b-none max-sm:m-0 max-sm:mt-auto max-sm:w-full max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:max-h-[var(--visual-viewport-height,90dvh)]',
		right:
			'my-auto ml-auto mr-0 h-[100dvh] max-h-[100dvh] w-full sm:w-[28rem] rounded-none sm:rounded-l-xl max-sm:m-0 max-sm:mt-auto max-sm:w-full max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:h-auto max-sm:max-h-[var(--visual-viewport-height,90dvh)]'
	};

	const openAnimation: Record<SheetSide, string> = {
		bottom: 'open:animate-slide-up',
		right: 'open:animate-slide-from-right max-sm:open:animate-slide-up'
	};

	const closeAnimation: Record<SheetSide, string> = {
		bottom: 'animate-slide-to-down',
		right: 'animate-slide-to-right max-sm:animate-slide-to-down'
	};
</script>

<dialog
	bind:this={dialogEl}
	aria-labelledby={title ? titleId : undefined}
	aria-describedby={description ? descId : undefined}
	style={touchDiffY > 0 ? `transform: translateY(${touchDiffY}px); transition: none;` : undefined}
	class={cn(
		'border border-border bg-surface p-0 text-ink shadow-sheet backdrop:bg-ink/40 backdrop:backdrop-blur-sm',
		sideClasses[side],
		closing ? closeAnimation[side] : openAnimation[side],
		className
	)}
	oncancel={(event) => {
		event.preventDefault();
		requestClose();
	}}
	onclick={onBackdropClick}
>
	<div
		class={cn(
			'relative flex flex-col',
			side === 'right'
				? 'h-full max-sm:h-auto max-sm:max-h-[var(--visual-viewport-height,90dvh)]'
				: 'max-h-[var(--visual-viewport-height,85dvh)]'
		)}
	>
		<div
			class={cn(
				'cursor-grab touch-none justify-center pb-1 pt-3',
				side === 'bottom' ? 'flex' : 'hidden max-sm:flex'
			)}
			aria-hidden="true"
			ontouchstart={handleTouchStart}
			ontouchmove={handleTouchMove}
			ontouchend={handleTouchEnd}
			ontouchcancel={handleTouchEnd}
		>
			<span
				class="h-1.5 w-10 rounded-full bg-border transition-[width,background-color] duration-200 hover:w-14 hover:bg-border/70"
			></span>
		</div>

		{#if title || description}
			<!--
				No drag handlers here on purpose. They used to make the whole header a
				swipe-to-dismiss surface, so a sheet with a half-filled form closed on
				an accidental downward swipe and discarded the input. Dismissal now
				lives on the explicit grab handle above (and the close button), which
				is a deliberate gesture rather than something a scroll can trigger.
			-->
			<header
				inert={confirming}
				class={cn(
					'flex items-start justify-between gap-4 px-5 py-4',
					side === 'right' && 'pt-safe'
				)}
			>
				<div class="min-w-0">
					{#if title}
						<h2 id={titleId} class="text-lg font-semibold">{title}</h2>
					{/if}
					{#if description}
						<p id={descId} class="mt-1 text-sm text-ink-muted">{description}</p>
					{/if}
				</div>
				<button
					type="button"
					onclick={requestClose}
					aria-label={closeLabel}
					class="grid size-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 sm:size-9 sm:min-h-0 sm:min-w-0"
				>
					<X class="size-5" />
				</button>
			</header>
		{/if}

		<div
			bind:this={contentEl}
			inert={confirming}
			class="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-1"
		>
			{@render children()}
		</div>

		{#if footer}
			<footer
				inert={confirming}
				class={cn(
					'flex items-center justify-end gap-2 border-t border-border px-5 py-4',
					(side === 'right' || side === 'bottom') && 'pb-safe'
				)}
			>
				{@render footer()}
			</footer>
		{/if}

		{#if confirming}
			<!--
				Rendered inside the sheet rather than as a second `<dialog>`: nested
				modals stack their own focus traps and their own Escape handling, and
				the sheet's Escape already lands here through `requestClose()`.

				The dimmed area takes no click of its own: this prompt exists to make
				the user choose, and "tap anywhere to make it go away" is the gesture
				that threw the edits out in the first place. Escape and "Keep editing"
				both back out.
			-->
			<div
				class="absolute inset-0 z-10 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
			>
				<div
					bind:this={confirmEl}
					tabindex="-1"
					role="alertdialog"
					aria-modal="true"
					aria-labelledby={confirmTitleId}
					aria-describedby={confirmBodyId}
					class="w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-soft outline-none"
				>
					<h3 id={confirmTitleId} class="text-base font-semibold">{discardTitle}</h3>
					<p id={confirmBodyId} class="mt-1 text-sm text-ink-muted">{discardBody}</p>
					<div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button variant="ghost" onclick={keepEditing}>{keepEditingLabel}</Button>
						<Button variant="destructive" onclick={discardChanges}>{discardLabel}</Button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</dialog>
