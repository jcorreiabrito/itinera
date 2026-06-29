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

    const uid = ++nextId;
    const titleId = `dialog-title-${uid}`;
    const descId = `dialog-desc-${uid}`;

    $effect(() => {
        const el = dialogEl;
        if (!el) return;
        if (open && !el.open) el.showModal();
        else if (!open && el.open) el.close();
    });

    function requestClose() {
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
        'open:animate-fade-in m-auto w-[min(92vw,32rem)] rounded-xl border border-border bg-surface p-0 text-ink shadow-sheet backdrop:bg-ink/40',
        className
    )}
    oncancel={(event) => {
        event.preventDefault();
        requestClose();
    }}
    onclick={onBackdropClick}
>
    <div class="flex max-h-[80dvh] flex-col">
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
                    class="grid size-9 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
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
