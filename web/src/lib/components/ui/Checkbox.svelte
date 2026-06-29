<script lang="ts">
    import { cn } from '$lib/utils';

    interface Props {
        checked?: boolean;
        id?: string;
        name?: string;
        disabled?: boolean;
        label: string;
        description?: string;
        class?: string;
        onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
    }

    let { checked = false, label, description, disabled = false, class: className, ...rest }: Props = $props();
</script>

<label
    class={cn(
        'flex items-start gap-3 rounded-md p-1 text-sm',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className
    )}
>
    <input
        type="checkbox"
        {checked}
        {disabled}
        class="mt-0.5 size-5 shrink-0 rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30"
        {...rest}
    />
    <span class="min-w-0">
        <span class="font-medium text-ink">{label}</span>
        {#if description}
            <span class="mt-0.5 block text-xs text-ink-muted">{description}</span>
        {/if}
    </span>
</label>
