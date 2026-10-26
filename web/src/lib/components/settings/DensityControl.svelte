<script lang="ts">
	import { DENSITIES, type Density } from '$lib/density';
	import { t, type TranslationKey } from '$lib/i18n.svelte';

	interface Props {
		value: Density;
		onchange: (value: Density) => void;
	}

	let { value, onchange }: Props = $props();

	// Keys, not strings: the segment labels follow the active language.
	const LABEL_KEYS: Record<Density, TranslationKey> = {
		comfortable: 'density_comfortable',
		compact: 'density_compact'
	};
</script>

<fieldset class="min-w-0">
	<legend class="text-sm font-medium text-ink">{t('density_title')}</legend>
	<p class="mt-1 text-xs leading-relaxed text-ink-muted">{t('density_desc')}</p>

	<div class="mt-2 grid grid-cols-2 gap-1 rounded-md border border-border bg-surface-sunken p-1">
		{#each DENSITIES as density (density)}
			<div class="min-w-0">
				<!--
					Native radios, not buttons: the group is one tab stop and the arrow
					keys move between the two options, which a pair of toggle buttons
					would have to reimplement.
				-->
				<input
					id={`density-${density}`}
					type="radio"
					name="density"
					value={density}
					checked={value === density}
					onchange={() => onchange(density)}
					class="peer sr-only"
				/>
				<label
					for={`density-${density}`}
					class="flex min-h-touch cursor-pointer items-center justify-center rounded px-3 text-sm font-medium text-ink-muted transition-colors hover:text-ink peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-soft peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-600"
				>
					{t(LABEL_KEYS[density])}
				</label>
			</div>
		{/each}
	</div>
</fieldset>
