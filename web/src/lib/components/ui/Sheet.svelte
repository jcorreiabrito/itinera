<script lang="ts" module>
    export type SheetSide = 'bottom' | 'right';
    let nextId = 0;
</script>

<script lang="ts">
    import type { Snippet } from 'svelte';
    import { X } from 'lucide-svelte';
    import { cn } from '$lib/utils';

    interface Props {
        open?: boolean;
        side?: SheetSide;
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
        side = 'bottom',
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
    const titleId = `sheet-title-${uid}`;
    const descId = `sheet-desc-${uid}`;

    $effect(() => {
        const el = dialogEl;
        if (!el) return;
        if (open && !el.open) {
            closing = false;
            el.showModal();
        } else if (!open && el.open && !closing) {
            closing = true;
            setTimeout(() => {
                el.close();
                closing = false;
            }, 220);
        }
    });

    function requestClose() {
        open = false;
        onclose?.();
    }

    function onBackdropClick(event: MouseEvent) {
        if (event.target === dialogEl) requestClose();
    }

    const sideClasses: Record<SheetSide, string> = {
        bottom: 'm-auto mb-0 mt-auto w-full max-w-2xl rounded-t-xl rounded-b-none',
        right: 'my-auto ml-auto mr-0 h-[100dvh] max-h-[100dvh] w-[min(92vw,28rem)] rounded-l-xl rounded-r-none'
    };

    const openAnimation: Record<SheetSide, string> = {
        bottom: 'open:animate-slide-up',
        right: 'open:animate-slide-from-right'
    };

    const closeAnimation: Record<SheetSide, string> = {
        bottom: 'animate-slide-to-down',
        right: 'animate-slide-to-right'
    };
</script>

<dialog
    bind:this={dialogEl}
    aria-labelledby={title ? titleId : undefined}
    aria-describedby={description ? descId : undefined}
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
    <div class={cn('flex flex-col', side === 'right' ? 'h-full' : 'max-h-[85dvh]')}>
        {#if side === 'bottom'}
            <div class="flex justify-center pt-3" aria-hidden="true">
                <span class="h-1.5 w-10 rounded-full bg-border transition-[width,background-color] duration-200 hover:w-14 hover:bg-border/70 cursor-grab"></span>
            </div>
        {/if}

        {#if title || description}
            <header class="flex items-start justify-between gap-4 px-5 py-4">
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
                    class="grid size-9 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95"
                >
                    <X class="size-5" />
                </button>
            </header>
        {/if}

        <div class="flex-1 overflow-y-auto px-5 pb-5 pt-1">
            {@render children()}
        </div>

        {#if footer}
            <footer class="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
                {@render footer()}
            </footer>
        {/if}
    </div>
</dialog>
