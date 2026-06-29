<script lang="ts">
    import { formatMoney } from '$lib/format';
    import { fractionTone } from './labels';

    interface Props {
        /** Spent so far (home currency). */
        spent: number;
        /** Budget total (home currency); the parent only renders when set. */
        total: number;
        homeCurrency: string;
    }

    let { spent, total, homeCurrency = 'EUR' }: Props = $props();

    const fraction = $derived(total > 0 ? spent / total : 0);
    const clamped = $derived(Math.max(0, Math.min(1, fraction)));
    const pct = $derived(Math.round(fraction * 100));
    const remaining = $derived(total - spent);
    const over = $derived(remaining < 0);
    const tone = $derived(fractionTone(fraction));

    // Length of the 180° value arc: π · r with r = 50.
    const ARC = Math.PI * 50;
    const dashoffset = $derived(ARC * (1 - clamped));

    const STROKE: Record<'primary' | 'warning' | 'danger', string> = {
        primary: 'stroke-primary-600',
        warning: 'stroke-warning',
        danger: 'stroke-danger'
    };

    const srText = $derived(
        `${formatMoney(spent, homeCurrency)} spent of ${formatMoney(total, homeCurrency)} budget – ${pct}% used, ` +
        (over
            ? `${formatMoney(Math.abs(remaining), homeCurrency)} over budget.`
            : `${formatMoney(remaining, homeCurrency)} left.`)
    );
</script>

<div class="flex flex-col items-center">
    <div class="relative w-full max-w-[15rem]" aria-hidden="true">
        <svg viewBox="0 0 120 60" class="w-full">
            <path
                d="M 10 60 A 50 50 0 0 1 110 60"
                fill="none"
                class="stroke-surface-sunken"
                stroke-width="11"
                stroke-linecap="round"
            />
            <path
                d="M 10 60 A 50 50 0 0 1 110 60"
                fill="none"
                class={`${STROKE[tone]} motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500 motion-safe:ease-out`}
                stroke-width="11"
                stroke-linecap="round"
                stroke-dasharray={ARC}
                stroke-dashoffset={dashoffset}
            />
        </svg>
        <div class="absolute inset-x-0 bottom-1 flex flex-col items-center">
            <span class="font-serif text-3xl font-semibold leading-none tabular-nums">{pct}%</span>
        </div>
    </div>
    <p
        class={`mt-1.5 text-sm font-medium ${over ? 'text-danger' : 'text-ink-muted'}`}
        aria-hidden="true"
    >
        {#if over}
            {formatMoney(Math.abs(remaining), homeCurrency)} over budget
        {:else}
            {formatMoney(remaining, homeCurrency)} left
        {/if}
    </p>
    <span class="sr-only">{srText}</span>
</div>