<script lang="ts">
	import { syncStatus } from '$lib/db';
	import { t } from '$lib/i18n.svelte';
	import { CloudOff } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
</script>

{#if $syncStatus.state === 'offline' || $syncStatus.state === 'error'}
	<div
		role="status"
		aria-live="polite"
		transition:fade={{ duration: 150 }}
		class="flex items-center justify-center gap-2 bg-surface-sunken px-4 py-1.5 text-center text-xs font-medium text-ink-muted"
	>
		<CloudOff class="size-3.5 shrink-0" />
		<span>{$syncStatus.state === 'error' ? t('disconnected_showing_data') : t('offline_showing_data')}</span>
	</div>
{/if}
