<script lang="ts">
    import type { NavItem } from '$lib/types';
    import { Compass } from 'lucide-svelte';
    import { cn } from '$lib/utils';

    interface Props {
        items: NavItem[];
        currentPath?: string;
    }

    let { items, currentPath = '/' }: Props = $props();
</script>

<aside
    class="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface lg:flex"
>
    <a href="/" class="flex h-16 items-center gap-2 border-b border-border px-5">
        <span
            class="grid size-9 place-items-center rounded-md bg-primary-600 text-white [&_svg]:size-5"
        >
            <Compass />
        </span>
        <span class="font-serif text-xl font-semibold">Itinera</span>
    </a>

    <nav aria-label="Primary" class="flex-1 overflow-y-auto p-3">
        <ul class="flex flex-col gap-1">
            {#each items as item (item.label)}
                {@const Icon = item.icon}
                {@const active = !item.disabled && currentPath === item.href}
                <li>
                    {#if item.disabled}
                        <span
                            aria-disabled="true"
                            title="Coming soon"
                            class="flex min-h-touch items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-muted/45 [&_svg]:size-5"
                        >
                            <Icon />
                            <span>{item.label}</span>
                        </span>
                    {:else}
                        <a
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            class={cn(
                                'flex min-h-touch items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-5',
                                active
                                    ? 'bg-primary-100 text-primary-700'
                                    : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
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

    <div class="border-t border-border p-4 text-xs text-ink-muted">
        <p>Offline-ready · v0.0.1</p>
    </div>
</aside>
