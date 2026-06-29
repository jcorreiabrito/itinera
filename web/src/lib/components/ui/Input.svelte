<script lang="ts" module>
    export type InputType =
        'text'
        | 'date'
        | 'time'
        | 'datetime-local'
        | 'number'
        | 'email'
        | 'search'
        | 'tel'
        | 'url';
</script>

<script lang="ts">
    import { cn } from '$lib/utils';

    interface Props {
        value?: string | number | null;
        type?: InputType;
        id?: string;
        name?: string;
        placeholder?: string;
        required?: boolean;
        disabled?: boolean;
        readonly?: boolean;
        min?: string | number;
        max?: string | number;
        step?: string | number;
        inputmode?: 'text' | 'numeric' | 'decimal' | 'email' | 'search' | 'tel' | 'url';
        maxlength?: number;
        invalid?: boolean;
        class?: string;
        oninput?: (event: Event & { currentTarget: HTMLInputElement }) => void;
        onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
        onblur?: (event: FocusEvent & { currentTarget: HTMLInputElement }) => void;
        onkeydown?: (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => void;
    }

    let {
        value = '',
        type = 'text',
        invalid = false,
        class: className,
        ...rest
    }: Props = $props();
</script>

<input
    {type}
    value={value ?? ''}
    aria-invalid={invalid || undefined}
    class={cn(
        'h-9 w-full rounded-md border bg-surface px-3 text-base text-ink shadow-sm transition-colors placeholder:text-ink-muted/60 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30 disabled:cursor-not-allowed disabled:opacity-60',
        invalid ? 'border-danger' : 'border-border',
        className
    )}
    {...rest}
/>