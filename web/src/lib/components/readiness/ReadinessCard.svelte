<script lang="ts">
	import {
		ChevronDown,
		ChevronRight,
		CircleAlert,
		CircleCheckBig,
		ClipboardCheck,
		Info
	} from 'lucide-svelte';
	import { Badge, Card } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import type { ReadinessResult, ReadinessSeverity } from '$lib/readiness';
	import { cn } from '$lib/utils';

	interface Props {
		readiness: ReadinessResult;
		class?: string;
	}

	let { readiness, class: className }: Props = $props();

	/**
	 * On a phone the card leads with the score and hides the list behind one tap;
	 * from `lg` up the three rows sit beside the score, where there is room for
	 * them. The toggle exists only on mobile, so the open state never matters on
	 * a desk.
	 */
	let expanded = $state(false);

	const tone = $derived(
		readiness.score >= 80 ? 'text-success' : readiness.score >= 50 ? 'text-warning' : 'text-danger'
	);

	const subtitle = $derived(
		readiness.items.length === 0
			? t('readiness_subtitle_clear')
			: readiness.items.length === 1
				? t('readiness_subtitle_issues_one')
				: t('readiness_subtitle_issues_many', { n: String(readiness.items.length) })
	);

	const top = $derived(readiness.items.slice(0, 3));

	const severityTone: Record<ReadinessSeverity, string> = {
		danger: 'text-danger',
		warning: 'text-warning',
		info: 'text-info'
	};

	const detailsId = 'readiness-details';
</script>

<Card class={cn('p-4 sm:p-5', className)}>
	<div class="flex items-start gap-3">
		<span
			class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface-sunken text-primary-700 [&_svg]:size-4"
			aria-hidden="true"
		>
			<ClipboardCheck />
		</span>

		<div class="min-w-0 flex-1">
			<h2 class="font-serif text-base font-semibold text-ink">{t('readiness_title')}</h2>
			<p class="text-sm text-ink-muted">{subtitle}</p>
		</div>

		<span
			class="relative grid size-14 shrink-0 place-items-center"
			role="img"
			aria-label={t('readiness_score_aria', { score: String(readiness.score) })}
		>
			<svg viewBox="0 0 64 64" class="size-14 -rotate-90" aria-hidden="true">
				<circle cx="32" cy="32" r="27" fill="none" stroke-width="6" class="stroke-border" />
				<circle
					cx="32"
					cy="32"
					r="27"
					fill="none"
					stroke-width="6"
					stroke-linecap="round"
					pathLength={100}
					stroke-dasharray="100"
					stroke-dashoffset={100 - readiness.score}
					class={cn(
						'stroke-current transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none',
						tone
					)}
				/>
			</svg>
			<span
				class="absolute inset-0 grid place-items-center text-base font-semibold tabular-nums text-ink"
			>
				{readiness.score}
			</span>
		</span>
	</div>

	{#if readiness.items.length === 0}
		<div class="mt-3 flex items-start gap-2 rounded-md bg-surface-sunken p-3">
			<CircleCheckBig class="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
			<div class="min-w-0">
				<p class="text-sm font-medium text-ink">{t('readiness_all_clear')}</p>
				<p class="text-xs text-ink-muted">{t('readiness_all_clear_desc')}</p>
			</div>
		</div>
	{:else}
		<button
			type="button"
			class="mt-2 flex min-h-touch w-full items-center justify-between gap-2 rounded-md text-sm font-medium text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg lg:hidden"
			aria-expanded={expanded}
			aria-controls={detailsId}
			onclick={() => (expanded = !expanded)}
		>
			{expanded ? t('readiness_hide_details') : t('readiness_show_details')}
			<ChevronDown
				class={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-180')}
				aria-hidden="true"
			/>
		</button>

		<ul id={detailsId} class={cn('mt-1 space-y-1 lg:mt-3 lg:block', expanded ? 'block' : 'hidden')}>
			{#each top as item (item.id)}
				<li>
					{#if item.href}
						<a
							href={item.href}
							class="flex min-h-touch items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
						>
							<span
								class={cn('mt-0.5 shrink-0 [&_svg]:size-4', severityTone[item.severity])}
								aria-hidden="true"
							>
								{#if item.severity === 'info'}<Info />{:else}<CircleAlert />{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
									<span class="text-sm font-medium text-ink">{t(item.titleKey)}</span>
									{#if item.count > 1}
										<Badge variant={item.severity}>{item.count}</Badge>
									{/if}
								</span>
								<span class="mt-0.5 block text-xs text-ink-muted">{item.detail}</span>
							</span>
							<ChevronRight class="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
						</a>
					{:else}
						<div class="flex min-h-touch items-start gap-2 px-2 py-1.5">
							<span
								class={cn('mt-0.5 shrink-0 [&_svg]:size-4', severityTone[item.severity])}
								aria-hidden="true"
							>
								{#if item.severity === 'info'}<Info />{:else}<CircleAlert />{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
									<span class="text-sm font-medium text-ink">{t(item.titleKey)}</span>
									{#if item.count > 1}
										<Badge variant={item.severity}>{item.count}</Badge>
									{/if}
								</span>
								<span class="mt-0.5 block text-xs text-ink-muted">{item.detail}</span>
							</span>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</Card>
