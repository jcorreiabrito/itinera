<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { IconComponent } from '$lib/types';
    import { cn } from '$lib/utils';

    interface Props {
        icon?: IconComponent;
        title: string;
        description?: string;
        class?: string;
        /** Call-to-action area (e.g. a Button). */
        children?: Snippet;
    }

    let { icon, title, description, class: className, children }: Props = $props();
</script>

<div
    class={cn(
        'mx-auto flex max-w-md flex-col items-center justify-center px-6 py-10 text-center',
        className
    )}
>
    {#if icon}
        {@const Icon = icon}
        <div
            class="mb-5 grid size-16 place-items-center rounded-full bg-primary-100 text-primary-600 animate-slide-up animate-bounce-soft [&_svg]:size-8"
            aria-hidden="true"
            style="animation-delay: 0ms, 400ms"
        >
            <Icon />
        </div>
    {/if}

    <h2 class="text-balance text-2xl font-semibold animate-slide-up" style="animation-delay: 80ms">{title}</h2>

    {#if description}
        <p class="mt-2 text-pretty text-ink-muted animate-slide-up" style="animation-delay: 160ms">{description}</p>
    {/if}

    {#if children}
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3 animate-slide-up" style="animation-delay: 240ms">
            {@render children()}
        </div>
    {/if}
</div>
