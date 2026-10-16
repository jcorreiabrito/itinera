<script lang="ts">
	import { fly } from 'svelte/transition';
	import { X } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { t } from '$lib/i18n.svelte';
	import { pauseToast, resumeToast, toast, toasts, type ToastVariant } from './toast';

	const accents: Record<ToastVariant, string> = {
		default: 'border-l-ink-muted',
		success: 'border-l-success',
		warning: 'border-l-warning',
		danger: 'border-l-danger',
		info: 'border-l-info'
	};
</script>

<div
	class="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6"
	aria-live="polite"
	aria-atomic="false"
>
	{#each $toasts as item (item.id)}
		<!--
			The countdown stops while the pointer is over the toast or the keyboard
			is inside it, so the seconds spent reaching for "Undo" are not charged
			against the window it is offering. `focusin`/`focusout` rather than
			`focus`/`blur` because the buttons inside do not bubble those.
		-->
		<div
			transition:fly={{ y: 16, duration: 280, opacity: 0 }}
			role="status"
			onmouseenter={() => pauseToast(item.id)}
			onmouseleave={() => resumeToast(item.id)}
			onfocusin={() => pauseToast(item.id)}
			onfocusout={() => resumeToast(item.id)}
			class={cn(
				'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-l-4 border-border bg-surface px-4 py-3 shadow-card',
				accents[item.variant]
			)}
		>
			<p class="flex-1 text-sm text-ink">{item.message}</p>
			{#if item.action}
				<button
					type="button"
					onclick={() => {
						item.action?.onClick();
						toast.dismiss(item.id);
					}}
					class="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 active:scale-95"
				>
					{item.action.label}
				</button>
			{/if}
			<button
				type="button"
				onclick={() => toast.dismiss(item.id)}
				aria-label={t('dismiss_notification')}
				class="-mr-1 grid size-6 shrink-0 place-items-center rounded text-ink-muted transition-colors hover:text-ink active:scale-90"
			>
				<X class="size-4" />
			</button>
		</div>
	{/each}
</div>
