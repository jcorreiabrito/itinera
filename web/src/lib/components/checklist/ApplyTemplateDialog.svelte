<script lang="ts">
	import { checklist } from '$lib/db';
	import type { ChecklistTemplate } from '$lib/db';
	import { Badge, Button, Dialog, Field, Select, toast } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import { cn } from '$lib/utils';
	import { CheckCircle2, Sparkles, Star } from 'lucide-svelte';

	interface Props {
		open?: boolean;
		/** Bare trip ULID. */
		tripId: string;
		onapplied?: () => void;
	}

	let { open = $bindable(false), tripId, onapplied }: Props = $props();

	let templates = $state<ChecklistTemplate[]>([]);
	let loading = $state(false);
	let applying = $state(false);
	let selectedId = $state('');
	let mode = $state<checklist.ApplyTemplateMode>('merge');
	let wasOpen = false;

	async function loadTemplates() {
		loading = true;
		try {
			const list = await checklist.templates.list();
			templates = list;
			const def = list.find((tpl) => tpl.isDefault);
			selectedId = def?._id ?? list[0]?._id ?? '';
		} catch {
			toast.error(t('could_not_load_templates'));
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open && !wasOpen) loadTemplates();
		wasOpen = open;
	});

	const selectedTemplate = $derived(templates.find((tpl) => tpl._id === selectedId));

	const groupedItems = $derived.by(() => {
		if (!selectedTemplate?.items) return [];
		/* eslint-disable-next-line svelte/prefer-svelte-reactivity -- a plain Map/Date is correct here: this is a local accumulator/registry rebuilt on every run, not reactive $state. SvelteMap would add reactivity nobody reads. */
		const map = new Map<string, typeof selectedTemplate.items>();
		for (const item of selectedTemplate.items) {
			const g = item.group ?? t('packing');
			(map.get(g) ?? map.set(g, []).get(g)!).push(item);
		}
		return [...map.entries()].map(([group, items]) => ({ group, items }));
	});

	/** Option label, e.g. "Praia (Default) · 12 items". */
	function templateOptionLabel(tpl: ChecklistTemplate): string {
		const name = tpl.name ?? t('untitled');
		const isDefault = tpl.isDefault ? ` ${t('default_parens')}` : '';
		const count = tpl.items?.length ?? 0;
		const items =
			count === 1 ? t('items_count', { n: '1' }) : t('items_count_plural', { n: String(count) });
		return `${name}${isDefault} · ${items}`;
	}

	const selectedCountLabel = $derived.by(() => {
		const count = selectedTemplate?.items?.length ?? 0;
		return count === 1
			? t('items_count', { n: '1' })
			: t('items_count_plural', { n: String(count) });
	});

	const groupsLabel = $derived(
		groupedItems.length === 1
			? t('in_groups_one', { n: String(groupedItems.length) })
			: t('in_groups_many', { n: String(groupedItems.length) })
	);

	async function apply() {
		if (!selectedId) return;
		applying = true;
		try {
			const added = await checklist.applyTemplate(tripId, selectedId, mode);
			open = false;
			toast.success(
				mode === 'replace'
					? t('checklist_replaced_from_template')
					: added > 0
						? t(added === 1 ? 'added_items_one' : 'added_items_many', { n: String(added) })
						: t('already_up_to_date')
			);
			onapplied?.();
		} catch {
			toast.error(t('could_not_apply_template'));
		} finally {
			applying = false;
		}
	}

	const modeClass = (active: boolean) =>
		cn(
			'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors text-left cursor-pointer',
			active
				? 'border-primary-600 bg-primary-100/60 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
				: 'border-border bg-surface text-ink-muted hover:bg-surface-sunken'
		);
</script>

<Dialog bind:open title={t('apply_a_template')} description={t('apply_template_desc')}>
	{#if loading}
		<div class="py-8 text-center text-sm text-ink-muted">{t('loading_templates')}</div>
	{:else if templates.length === 0}
		<p class="text-sm text-ink-muted">{t('no_templates_available')}</p>
	{:else}
		<div class="flex flex-col gap-4">
			<Field label={t('select_template')} for="apply-template">
				<Select
					id="apply-template"
					value={selectedId}
					onchange={(e) => (selectedId = e.currentTarget.value)}
				>
					<optgroup label={t('builtin_templates')}>
						{#each templates.filter((tpl) => tpl._id.startsWith('tpl:builtin:')) as tpl (tpl._id)}
							<option value={tpl._id}>{templateOptionLabel(tpl)}</option>
						{/each}
					</optgroup>
					{#if templates.some((tpl) => !tpl._id.startsWith('tpl:builtin:'))}
						<optgroup label={t('my_templates')}>
							{#each templates.filter((tpl) => !tpl._id.startsWith('tpl:builtin:')) as tpl (tpl._id)}
								<option value={tpl._id}>{templateOptionLabel(tpl)}</option>
							{/each}
						</optgroup>
					{/if}
				</Select>
			</Field>

			{#if selectedTemplate}
				<!-- Template Card / Info -->
				<div class="rounded-lg border border-border bg-surface-sunken p-3 text-sm">
					<div class="flex items-center justify-between gap-2">
						<div class="flex items-center gap-2">
							<span class="font-semibold text-ink">{selectedTemplate.name}</span>
							{#if selectedTemplate._id.startsWith('tpl:builtin:')}
								<Badge variant="primary" class="gap-1">
									<Sparkles class="size-3" />
									{t('builtin_template')}
								</Badge>
							{/if}
							{#if selectedTemplate.isDefault}
								<Badge variant="warning">{t('default')}</Badge>
							{/if}
						</div>
						<span class="text-xs tabular-nums text-ink-muted">
							{selectedCountLabel}
							{groupsLabel}
						</span>
					</div>

					{#if selectedTemplate.description}
						<p class="mt-1.5 text-xs text-ink-muted">{selectedTemplate.description}</p>
					{/if}

					<!-- Preview of groups and items -->
					<div
						class="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-md border border-border bg-surface p-2.5 text-xs"
					>
						{#each groupedItems as group (group.group)}
							<div>
								<div
									class="mb-1 flex items-center justify-between border-b border-border/40 pb-1 font-medium text-ink"
								>
									<span>{group.group}</span>
									<span class="text-[10px] text-ink-muted">{group.items.length}</span>
								</div>
								<ul class="space-y-1 pl-1">
									{#each group.items as item (item.text)}
										<li class="flex items-center gap-1.5 text-ink-muted">
											<CheckCircle2 class="size-3 shrink-0 text-ink-muted/50" />
											<span class="truncate">{item.text}</span>
											{#if item.important}
												<Star class="size-2.5 shrink-0 fill-accent-amber text-accent-amber" />
											{/if}
											{#if item.quantity && item.quantity > 1}
												<span class="font-mono text-[10px] text-ink-muted">({item.quantity}x)</span>
											{/if}
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<fieldset class="flex flex-col gap-1.5">
				<legend class="text-sm font-medium text-ink">{t('application_strategy')}</legend>
				<div class="flex gap-2">
					<button
						type="button"
						class={modeClass(mode === 'merge')}
						onclick={() => (mode = 'merge')}
					>
						<div class="font-semibold">{t('merge')}</div>
						<div class="text-xs text-ink-muted">{t('merge_desc')}</div>
					</button>
					<button
						type="button"
						class={modeClass(mode === 'replace')}
						onclick={() => (mode = 'replace')}
					>
						<div class="font-semibold">{t('replace')}</div>
						<div class="text-xs text-ink-muted">{t('replace_desc')}</div>
					</button>
				</div>
			</fieldset>
		</div>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)} disabled={applying}>{t('cancel')}</Button
		>
		<Button onclick={apply} disabled={applying || loading || !selectedId}>
			{applying ? t('applying') : t('apply_template')}
		</Button>
	{/snippet}
</Dialog>
