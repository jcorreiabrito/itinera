<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		value?: string | null;
		id?: string;
		name?: string;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		rows?: number;
		maxlength?: number;
		invalid?: boolean;
		class?: string;
		oninput?: (event: Event & { currentTarget: HTMLTextAreaElement }) => void;
		onchange?: (event: Event & { currentTarget: HTMLTextAreaElement }) => void;
		onblur?: (event: FocusEvent & { currentTarget: HTMLTextAreaElement }) => void;
	}

	let { value = '', rows = 4, invalid = false, class: className, ...rest }: Props = $props();
</script>

<textarea
	{rows}
	value={value ?? ''}
	aria-invalid={invalid || undefined}
	class={cn(
		/* Full-opacity `ink-muted`, like Input.svelte: `/60` measured 2.50:1 on the
		 * light surface and 3.45:1 on the dark one, both under WCAG 1.4.3's 4.5:1. */
		'w-full rounded-md border bg-surface px-3 py-2 text-base text-ink shadow-sm transition-colors placeholder:text-ink-muted focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30 disabled:cursor-not-allowed disabled:opacity-60',
		invalid ? 'border-danger' : 'border-border',
		className
	)}
	{...rest}></textarea>
