<script lang="ts">
	import type { expenses } from '$lib/db';
	import { formatMoney } from '$lib/format';
	import { t } from '$lib/i18n.svelte';
	import { categoryLabel } from './labels';

	interface Props {
		categories: expenses.CategoryBudgetRow[];
		homeCurrency: string;
		unpaidOnly?: boolean;
		class?: string;
	}

	let { categories, homeCurrency, unpaidOnly = false, class: className = '' }: Props = $props();

	const CATEGORY_COLORS: Record<string, string> = {
		transport: '#3b82f6',
		lodging: '#6366f1',
		food: '#e0a458',
		activities: '#3e8e5a',
		shopping: '#ec4899',
		fees: '#64748b',
		other: '#94a3b8'
	};

	const items = $derived.by(() => {
		const list = categories.filter((c) => (unpaidOnly ? c.totals.unpaid > 0 : c.totals.spent > 0));
		const total = list.reduce((sum, c) => sum + (unpaidOnly ? c.totals.unpaid : c.totals.spent), 0);
		if (total <= 0) return [];

		let currentAngle = 0;
		return list.map((c) => {
			const value = unpaidOnly ? c.totals.unpaid : c.totals.spent;
			const pct = (value / total) * 100;
			const angle = (value / total) * 360;
			const start = currentAngle;
			currentAngle += angle;
			return {
				category: c.category,
				label: categoryLabel(c.category),
				value,
				pct,
				color: CATEGORY_COLORS[c.category] || CATEGORY_COLORS.other,
				strokeDasharray: `${pct} ${100 - pct}`,
				strokeDashoffset: -start / 3.6
			};
		});
	});

	const totalSpent = $derived(items.reduce((acc, item) => acc + item.value, 0));

	let activeCategory = $state<string | null>(null);
</script>

{#if items.length > 0}
	<div
		class={`rounded-xl border border-border bg-surface p-4 shadow-soft transition-all duration-200 ${className}`}
	>
		<div class="flex flex-col items-center justify-between gap-6 sm:flex-row">
			<!-- SVG Donut Ring -->
			<div class="relative size-36 shrink-0">
				<svg viewBox="0 0 36 36" class="size-full -rotate-90" aria-hidden="true">
					<!-- Background track -->
					<circle
						cx="18"
						cy="18"
						r="15.9155"
						fill="transparent"
						stroke="currentColor"
						stroke-width="3.5"
						class="text-surface-sunken"
					/>
					{#each items as item (item.category)}
						<circle
							cx="18"
							cy="18"
							r="15.9155"
							fill="transparent"
							stroke={item.color}
							stroke-width={activeCategory === item.category ? '4.8' : '3.8'}
							stroke-dasharray={item.strokeDasharray}
							stroke-dashoffset={item.strokeDashoffset}
							class="cursor-pointer transition-all duration-200"
							role="presentation"
							onmouseenter={() => (activeCategory = item.category)}
							onmouseleave={() => (activeCategory = null)}
						/>
					{/each}
				</svg>
				<div class="absolute inset-0 flex flex-col items-center justify-center text-center">
					<span class="text-[0.65rem] font-medium uppercase tracking-wider text-ink-muted">
						{unpaidOnly ? t('unpaid') : t('costs_spent_label')}
					</span>
					<span class="text-sm font-bold tabular-nums text-ink">
						{formatMoney(totalSpent, homeCurrency)}
					</span>
				</div>
			</div>

			<!-- Category Legend -->
			<div class="grid w-full flex-1 grid-cols-1 gap-2 sm:grid-cols-2" role="list">
				{#each items as item (item.category)}
					<div
						role="listitem"
						class={`flex cursor-pointer items-center justify-between gap-2 rounded-lg p-1.5 px-2 text-xs transition-colors ${
							activeCategory === item.category
								? 'bg-surface-sunken font-semibold'
								: 'hover:bg-surface-sunken/60'
						}`}
						onmouseenter={() => (activeCategory = item.category)}
						onmouseleave={() => (activeCategory = null)}
					>
						<div class="flex min-w-0 items-center gap-2">
							<span
								class="size-2.5 shrink-0 rounded-full"
								style={`background-color: ${item.color}`}
								aria-hidden="true"
							></span>
							<span class="truncate text-ink">{item.label}</span>
						</div>
						<div class="flex shrink-0 items-center gap-1.5 tabular-nums">
							<span class="font-medium text-ink">{formatMoney(item.value, homeCurrency)}</span>
							<span class="text-[0.7rem] text-ink-muted">({item.pct.toFixed(0)}%)</span>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
