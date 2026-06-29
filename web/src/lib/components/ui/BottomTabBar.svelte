<script lang="ts">
    import type { NavItem } from '$lib/types';
    import { cn } from '$lib/utils';

    interface Props {
        items: NavItem[];
        currentPath: string;
    }

    let { items, currentPath = '/' }: Props = $props();
</script>

<nav
    aria-label="Primary"
    class="pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md lg:hidden"
>
    <ul class="mx-auto flex max-w-xl items-stretch justify-around">
        {#each items as item (item.label)}
            {@const Icon = item.icon}
            {@const active = !item.disabled && currentPath === item.href}
            <li class="flex-1">
                {#if item.disabled}
                    <span
                        aria-disabled="true"
                        title="Coming soon"
                        class="flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[0.7rem] text-ink-muted/45 [&_svg]:size-5"
                    >
                        <Icon />
                        <span>{item.label}</span>
                    </span>
                {:else}
                    <a
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        class={cn(
                            'flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[0.7rem] font-medium transition-colors [&_svg]:size-5',
                            active ? 'text-primary-600' : 'text-ink-muted hover:text-ink'
                        )}
                    >
                        <Icon />
                        <span>{item.label}</span>
                    </a>
                {/if}
            </li>
        {/each}
    </ul>
</nav>
