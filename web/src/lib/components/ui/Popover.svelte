<script lang="ts">
	import { untrack } from 'svelte';
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	interface Props {
		open?: boolean;
		/** Horizontal anchor edge of the panel. */
		align?: 'start' | 'end';
		/** Accessible label for the popup group. */
		label?: string;
		class?: string;
		panelClass?: string;
		/** Renders the trigger; receives a `toggle` callback and the open state. */
		trigger: Snippet<[{ toggle: () => void; open: boolean }]>;
		children: Snippet;
	}

	let {
		open = $bindable(false),
		align = 'end',
		label,
		class: className,
		panelClass,
		trigger,
		children
	}: Props = $props();

	let root = $state<HTMLElement>();
	let panel = $state<HTMLElement>();

	/** Everything inside the panel a keyboard user can land on. */
	const FOCUSABLE =
		'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

	function items(): HTMLElement[] {
		return panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
	}

	function toggle() {
		open = !open;
	}

	/**
	 * Take the keyboard into the panel, and give it back on the way out.
	 *
	 * Without this the panel opened *behind* the tab order: a keyboard user
	 * pressed Enter on the trigger and then had to tab through the rest of the
	 * page to reach the actions that had just appeared next to it. Escape closed
	 * the panel and left focus on the body, so the next Tab restarted at the top
	 * of the document.
	 *
	 * `panel` is read untracked: it is bound by the same render that flips `open`,
	 * so tracking it would re-run this effect and move focus twice.
	 */
	$effect(() => {
		if (!open) return;
		const returnTo = document.activeElement as HTMLElement | null;
		const element = untrack(() => panel);
		const first = element?.querySelector<HTMLElement>(FOCUSABLE);
		(first ?? element)?.focus();

		return () => {
			/*
			 * Only pull focus back if it is still ours to move. Clicking a link
			 * inside the panel navigates, and clicking a field outside it means
			 * the user has moved on — dragging focus back to the trigger would
			 * undo their click.
			 */
			const active = document.activeElement;
			const ours =
				!active ||
				active === document.body ||
				!!element?.contains(active) ||
				!!root?.contains(active);
			if (ours) returnTo?.focus();
		};
	});

	$effect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (root && !root.contains(event.target as Node)) open = false;
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				open = false;
				return;
			}
			/*
			 * Arrow keys walk the panel's actions, so a menu of eight items costs
			 * one keystroke each instead of a Tab per row. Home and End bracket
			 * the list. Everything else — Tab included — is left alone, so the
			 * user can still leave the panel the ordinary way.
			 */
			if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
			// A text field or a native select inside the panel owns its own arrow
			// keys; stealing them would make the panel's own form unusable.
			const active = document.activeElement;
			if (event.altKey || event.ctrlKey || event.metaKey) return;
			if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
			if (active instanceof HTMLSelectElement) return;
			const all = items();
			if (all.length === 0) return;
			const index = all.indexOf(active as HTMLElement);
			const next =
				event.key === 'Home'
					? 0
					: event.key === 'End'
						? all.length - 1
						: event.key === 'ArrowDown'
							? (index + 1) % all.length
							: index <= 0
								? all.length - 1
								: index - 1;
			event.preventDefault();
			all[next]?.focus();
		};
		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('keydown', onKeyDown);
		};
	});
</script>

<div class={cn('relative inline-block', className)} bind:this={root}>
	{@render trigger({ toggle, open })}
	{#if open}
		<div
			bind:this={panel}
			role="group"
			aria-label={label}
			tabindex="-1"
			class={cn(
				'absolute z-50 mt-2 min-w-[12rem] rounded-lg border border-border bg-surface p-1 shadow-card outline-none',
				align === 'end' ? 'right-0' : 'left-0',
				panelClass
			)}
		>
			{@render children()}
		</div>
	{/if}
</div>
