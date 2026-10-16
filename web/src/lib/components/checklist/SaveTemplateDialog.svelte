<script lang="ts">
	import { checklist } from '$lib/db';
	import { Button, Dialog, Field, Input, toast } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';

	interface Props {
		open?: boolean;
		/** Bare trip ULID. */
		tripId: string;
		/** Default trip name to prefill the template name. */
		suggestedName?: string;
		onsaved?: () => void;
	}

	let { open = $bindable(false), tripId, suggestedName = '', onsaved }: Props = $props();

	let name = $state('');
	let isDefault = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let wasOpen = false;

	$effect(() => {
		if (open && !wasOpen) {
			name = suggestedName;
			isDefault = false;
			error = null;
		}
		wasOpen = open;
	});

	async function save() {
		if (!name.trim()) {
			error = t('give_template_name');
			return;
		}
		saving = true;
		try {
			await checklist.saveAsTemplate(tripId, name.trim(), isDefault);
			open = false;
			toast.success(t('saved_as_template'));
			onsaved?.();
		} catch {
			toast.error(t('could_not_save_template'));
		} finally {
			saving = false;
		}
	}
</script>

<Dialog bind:open title={t('save_as_template')} description={t('save_template_desc')}>
	<div class="flex flex-col gap-4">
		<Field label={t('template_name')} for="save-template-name" required {error}>
			<Input
				id="save-template-name"
				value={name}
				placeholder={t('template_name_placeholder')}
				invalid={!!error}
				oninput={(e) => {
					name = e.currentTarget.value;
					error = null;
				}}
			/>
		</Field>
		<label class="flex items-center gap-3 text-sm">
			<input
				type="checkbox"
				checked={isDefault}
				class="size-5 rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30"
				onchange={(e) => (isDefault = e.currentTarget.checked)}
			/>
			<span class="font-medium text-ink">{t('offer_template_default')}</span>
		</label>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)} disabled={saving}>{t('cancel')}</Button>
		<Button onclick={save} disabled={saving}>{saving ? t('saving') : t('save_template')}</Button>
	{/snippet}
</Dialog>
