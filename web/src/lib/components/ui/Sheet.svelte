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
    let contentEl = $state<HTMLDivElement>();
    let closing = $state(false);

    let touchStartY = 0;
    let touchDiffY = $state(0);
    let isDragging = $state(false);

    const uid = ++nextId;
    const titleId = `sheet-title-${uid}`;
    const descId = `sheet-desc-${uid}`;

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
        bottom: 'm-auto mb-0 mt-auto w-full max-w-2xl rounded-t-xl rounded-b-none max-sm:m-0 max-sm:mt-auto max-sm:w-full max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:max-h-[var(--visual-viewport-height,90dvh)]',
        right: 'my-auto ml-auto mr-0 h-[100dvh] max-h-[100dvh] w-full sm:w-[28rem] rounded-none sm:rounded-l-xl max-sm:m-0 max-sm:mt-auto max-sm:w-full max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:h-auto max-sm:max-h-[var(--visual-viewport-height,90dvh)]'
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
    <div class={cn('flex flex-col', side === 'right' ? 'h-full max-sm:h-auto max-sm:max-h-[var(--visual-viewport-height,90dvh)]' : 'max-h-[var(--visual-viewport-height,85dvh)]')}>
        <div
            class={cn('justify-center pt-3 pb-1 cursor-grab touch-none', side === 'bottom' ? 'flex' : 'hidden max-sm:flex')}
            aria-hidden="true"
            ontouchstart={handleTouchStart}
            ontouchmove={handleTouchMove}
            ontouchend={handleTouchEnd}
        >
            <span class="h-1.5 w-10 rounded-full bg-border transition-[width,background-color] duration-200 hover:w-14 hover:bg-border/70"></span>
        </div>

        {#if title || description}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <header
                class={cn('flex items-start justify-between gap-4 px-5 py-4', side === 'right' && 'pt-safe')}
                ontouchstart={handleTouchStart}
                ontouchmove={handleTouchMove}
                ontouchend={handleTouchEnd}
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
                    class="grid size-11 sm:size-9 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95"
                >
                    <X class="size-5" />
                </button>
            </header>
        {/if}

        <div bind:this={contentEl} class="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">
            {@render children()}
        </div>

        {#if footer}
            <footer class={cn('flex items-center justify-end gap-2 border-t border-border px-5 py-4', (side === 'right' || side === 'bottom') && 'pb-safe')}>
                {@render footer()}
            </footer>
        {/if}
    </div>
</dialog>
