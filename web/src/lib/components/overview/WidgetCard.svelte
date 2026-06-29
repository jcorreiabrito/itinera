<script lang="ts" module>
    let widgetCount = 0;
</script>

<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { IconComponent } from '$lib/types';
    import { ChevronRight } from 'lucide-svelte';
    import { cn } from '$lib/utils';

    interface Props {
        title: string;
        icon: IconComponent;
        /** Links the widget into its full section. */
        href?: string;
        linkLabel?: string;
        class?: string;
        children: Snippet;
        /** Optional header-right content (used instead of a link). */
        action?: Snippet;
    }

    let { title, icon, href, linkLabel, class: className, children, action }: Props = $props();

    const headingId = `widget-${++widgetCount}`;
</script>

<section
    aria-labelledby={headingId}
    class={cn('rounded-lg border border-border bg-surface p-4 sm:p-5', className)}
>
    <div class="mb-3 flex items-center justify-between gap-2">
        <h2
            id={headingId}
            class="flex items-center gap-2 text-sm font-semibold text-ink-muted [&_svg]:size-4"
        >
            {#if icon}{@const Icon = icon}<Icon />{/if}
            {title}
        </h2>
        {#if href}
            <a
                {href}
                class="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary-700 hover:underline"
            >
                {linkLabel ?? 'Open'}
                <ChevronRight class="size-3.5" />
            </a>
        {:else if action}
            {@render action()}
        {/if}
    </div>
    {@render children()}
</section>