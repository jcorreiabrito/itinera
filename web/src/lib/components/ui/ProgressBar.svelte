<script lang="ts" module>
    export type ProgressTone = 'primary' | 'success' | 'warning' | 'danger';
</script>

<script lang="ts">
    import { cn } from '$lib/utils';

    interface Props {
        /** Fraction in `0..1` (clamped). */
        value: number;
        tone?: ProgressTone;
        /** Bar thickness. */
        size?: 'sm' | 'md';
        label?: string;
        class?: string;
    }

    let { value, tone = 'primary', size = 'md', label, class: className }: Props = $props();

    const pct = $derived(Math.round(Math.max(0, Math.min(1, value || 0)) * 100));

    const tones: Record<ProgressTone, string> = {
        primary: 'bg-primary-600',
        success: 'bg-success',
        warning: 'bg-warning',
        danger: 'bg-danger',
    };
</script>

<div
    class={cn('w-full overflow-hidden rounded-full bg-surface-sunken', size === 'sm' ? 'h-1.5' : 'h-2.5', className)}
    role="progressbar"
    aria-valuenow={pct}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-label={label}
>
    <div class={cn('h-full rounded-full transition-[width] duration-700 ease-out', tones[tone])} style={`width:${pct}%`}></div>
</div>
