<script lang="ts">
	import { CalendarDays, Copy, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';

	interface Props {
		count: number;
		busy?: boolean;
		onmove: () => void;
		onduplicate: () => void;
		ondelete: () => void;
	}

	let { count, busy = false, onmove, onduplicate, ondelete }: Props = $props();

	const disabled = $derived(busy || count === 0);
</script>

<div
	role="toolbar"
	aria-label={t('batch_actions')}
	aria-busy={busy}
	class="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface p-1.5 shadow-soft"
>
	<Button variant="secondary" size="sm" onclick={onmove} {disabled}>
		<CalendarDays class="size-4" aria-hidden="true" />
		{t('move_to_day')}
	</Button>
	<Button variant="secondary" size="sm" onclick={onduplicate} {disabled}>
		<Copy class="size-4" aria-hidden="true" />
		{t('duplicate')}
	</Button>
	<Button variant="destructive" size="sm" onclick={ondelete} {disabled}>
		<Trash2 class="size-4" aria-hidden="true" />
		{t('delete')}
	</Button>
</div>
