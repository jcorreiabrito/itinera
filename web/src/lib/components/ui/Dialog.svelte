<script lang="ts" module>
	let nextId = 0;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	interface Props {
		open?: boolean;
		title?: string;
		description?: string;
		class?: string;
		closeLabel?: string;
		onclose?: () => void;
		children: Snippet;
		footer?: Snippet;
	}

	let {
		open = $bindable(false),
		title,
		description,
		class: className,
		closeLabel = 'Close',
		onclose,
		children,
		footer
	}: Props = $props();

	let dialogEl = $state<HTMLDialogElement>();
	let closing = $state(false);

	const uid = ++nextId;
	const titleId = `dialog-title-${uid}`;
	const descId = `dialog-desc-${uid}`;

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
			// Trigger close animation then close
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

	function requestClose() {
		if (typeof document !== 'undefined') {
			const openDialogs = document.querySelectorAll('dialog[open]');
			if (openDialogs.length <= 1) {
				document.documentElement.style.overflow = '';
			}
		}
		open = false;
		onclose?.();
	}

	function onBackdropClick(event: MouseEvent) {
		if (event.target === dialogEl) requestClose();
	}
</script>

<dialog
	bind:this={dialogEl}
	aria-labelledby={title ? titleId : undefined}
	aria-describedby={description ? descId : undefined}
	class={cn(
		'm-auto mb-0 w-full rounded-t-xl border border-border bg-surface p-0 text-ink shadow-sheet backdrop:bg-ink/40 backdrop:backdrop-blur-sm max-sm:m-0 max-sm:mt-auto max-sm:max-h-[var(--visual-viewport-height,88dvh)] sm:my-auto sm:w-[min(92vw,32rem)] sm:rounded-xl',
		closing
			? 'animate-pop-out max-sm:animate-slide-to-down'
			: 'open:animate-pop-in max-sm:open:animate-slide-up',
		className
	)}
	oncancel={(event) => {
		event.preventDefault();
		requestClose();
	}}
	onclick={onBackdropClick}
>
	<div class="flex max-h-[80dvh] flex-col max-sm:max-h-[var(--visual-viewport-height,88dvh)]">
		{#if title || description}
			<header class="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
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

		<div class="overflow-y-auto px-5 py-4">
			{@render children()}
		</div>

		{#if footer}
			<footer class="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
				{@render footer()}
			</footer>
		{/if}
	</div>
</dialog>
