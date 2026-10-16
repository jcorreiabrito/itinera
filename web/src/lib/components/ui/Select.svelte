<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	interface Props {
		value?: string | null;
		id?: string;
		name?: string;
		required?: boolean;
		disabled?: boolean;
		invalid?: boolean;
		class?: string;
		children: Snippet;
		onchange?: (event: Event & { currentTarget: HTMLSelectElement }) => void;
	}

	let {
		value = $bindable(''),
		invalid = false,
		class: className,
		children,
		...rest
	}: Props = $props();
</script>

<div class="relative">
	<select
		bind:value
		aria-invalid={invalid || undefined}
		class={cn(
			'h-11 min-h-[44px] w-full appearance-none rounded-md border bg-surface px-3 pr-9 text-base text-ink shadow-sm transition-colors focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30 disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 sm:min-h-0 sm:text-sm',
			invalid ? 'border-danger' : 'border-border',
			className
		)}
		{...rest}
	>
		{@render children()}
	</select>
	<ChevronDown
		class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
	/>
</div>
