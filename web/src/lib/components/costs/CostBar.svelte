<script lang="ts" module>
    export type BarTone = 'primary' | 'success' | 'warning' | 'danger';
</script>

<script lang="ts">
    import { cn } from '$lib/utils';
    import { TONE_FILL } from './labels';

    interface Props {
        /** The filled value (home currency). */
        value: number;
        /** Optional target / cap drawn as a marker line. */
        target?: number | null;
        /** Scale denominator shared across sibling bars so widths are comparable. */
        max: number;
        tone?: BarTone;
        class?: string;
    }

    let { value, target = null, max, tone = 'primary', class: className }: Props = $props();

    const scale = $derived(max > 0 ? max : 1);
    const valueN = $derived(Math.max(0, Math.min(1, value / scale)) * 100);
    const targetX = $derived(target != null ? Math.max(0, Math.min(1, target / scale)) * 100 : null);
</script>

<!--
Hand-rolled SVG bar: a rounded track (the wrapper) holds a value fill and an
optional dashed target marker. Decorative – the row text is the equivalent.
-->
<div
    class={cn('relative h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken', className)}
    aria-hidden="true"
>
    <svg
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        class="absolute inset-0 h-full w-full motion-safe:transition-none"
    >
        <rect x="0" y="0" height="10" width={valueN} class={TONE_FILL[tone]} />
        {#if targetX != null}
            <line
                x1={targetX}
                x2={targetX}
                y1="0"
                y2="10"
                class="stroke-ink/55"
                stroke-width="1.5"
                stroke-dasharray="2 1.5"
                vector-effect="non-scaling-stroke"
            />
        {/if}
    </svg>
</div>