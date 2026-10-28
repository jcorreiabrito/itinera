<script lang="ts">
	import { syncStatus } from '$lib/db';
	import {
		ClipboardPaste,
		Download,
		FileDown,
		FileJson,
		FileText,
		FileUp,
		MoreVertical,
		Pencil,
		Printer,
		Share2,
		WifiOff
	} from 'lucide-svelte';
	import { Dialog, Popover, toast } from '$lib/components/ui';
	import { downloadTripExport, downloadTripPdf } from '$lib/api';
	import { prepareTripUpdateDiff, executeTripUpdate, type TripUpdateDiff } from '$lib/db/importer';
	import {
		DREAM_TEMPLATE_SCHEMA,
		downloadDreamTemplate,
		prepareDreamTemplateDiff
	} from '$lib/db/dream-template';
	import { cn } from '$lib/utils';
	import { t } from '$lib/i18n.svelte';
	import { resolve } from '$app/paths';
	import UpdateDiffSheet from './UpdateDiffSheet.svelte';

	interface Props {
		/** Bare trip UUID or full trip ID. */
		tripid: string;
		title?: string;
		/** Whether to offer the compact, hand-editable dream-plan template. */
		dream?: boolean;
		onedit?: () => void;
		onshare?: () => void;
	}

	let { tripid, title, dream = false, onedit, onshare }: Props = $props();

	let open = $state(false);
	let busy = $state<'json' | 'pdf' | 'template' | 'update' | 'paste' | null>(null);

	let fileInputRef = $state<HTMLInputElement | null>(null);
	let diffSheetOpen = $state(false);
	let currentDiff = $state<TripUpdateDiff | null>(null);

	let pasteDialogOpen = $state(false);
	let pasteText = $state('');
	let pasteError = $state('');

	const pasteJsonError = $derived.by(() => {
		const text = pasteText.trim();
		if (!text) return '';
		try {
			JSON.parse(text);
			return '';
		} catch (e) {
			return e instanceof Error ? e.message : String(e);
		}
	});

	async function pasteFromClipboard() {
		try {
			const text = await navigator.clipboard.readText();
			pasteText = text;
		} catch {
			// clipboard access denied — user can paste manually
		}
	}

	import { network } from '$lib/stores/network.svelte';

	const online = $derived(
		network.isOnline && $syncStatus.state !== 'offline' && $syncStatus.state !== 'error'
	);

	async function exportJson() {
		if (!online || busy) return;
		busy = 'json';
		try {
			await downloadTripExport(tripid);
			toast.success(t('trip_json_exported'));
			open = false;
		} catch {
			toast.error(t('could_not_export_server'), {
				action: { label: t('retry'), onClick: exportJson }
			});
		} finally {
			busy = null;
		}
	}

	async function exportPdf() {
		if (!online || busy) return;
		busy = 'pdf';
		try {
			await downloadTripPdf(tripid);
			toast.success(t('pdf_ready'));
			open = false;
		} catch {
			toast.error(t('could_not_build_pdf_server'), {
				action: { label: t('retry'), onClick: exportPdf }
			});
		} finally {
			busy = null;
		}
	}

	async function exportDreamTemplate() {
		if (busy) return;
		busy = 'template';
		try {
			await downloadDreamTemplate(tripid);
			toast.success(t('dream_template_downloaded'));
			open = false;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('could_not_export_template'));
		} finally {
			busy = null;
		}
	}

	/**
	 * The file menu accepts both the full trip export and the compact dream
	 * template. Their schemas are distinct, so the diff is chosen by the payload
	 * itself rather than by a mode switch the user would have to remember.
	 */
	function prepareDiff(payload: unknown): Promise<TripUpdateDiff> {
		const schema =
			payload && typeof payload === 'object' ? (payload as { schema?: unknown }).schema : undefined;
		return schema === DREAM_TEMPLATE_SCHEMA
			? prepareDreamTemplateDiff(tripid, payload)
			: prepareTripUpdateDiff(tripid, payload);
	}

	function triggerUpdateFile() {
		fileInputRef?.click();
	}

	async function handleFileSelect(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		busy = 'update';
		try {
			const text = await file.text();
			const payload = JSON.parse(text);
			const diff = await prepareDiff(payload);
			currentDiff = diff;
			open = false;
			diffSheetOpen = true;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('invalid_json_file_for_update'));
		} finally {
			busy = null;
			if (input) input.value = '';
		}
	}

	async function confirmUpdate() {
		if (!currentDiff) return;
		try {
			if (currentDiff.apply) await currentDiff.apply();
			else await executeTripUpdate(currentDiff.readyToSaveDocs);
			toast.success(t('trip_updated_from_json'));
			setTimeout(() => {
				window.location.reload();
			}, 300);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('could_not_update_trip'));
		}
	}

	async function handlePasteUpdate() {
		const text = pasteText.trim();
		if (!text || pasteJsonError) {
			pasteError = t('paste_valid_json_first');
			return;
		}
		busy = 'paste';
		try {
			const payload = JSON.parse(text);
			const diff = await prepareDiff(payload);
			currentDiff = diff;
			pasteDialogOpen = false;
			pasteText = '';
			diffSheetOpen = true;
		} catch (err) {
			pasteError = err instanceof Error ? err.message : t('invalid_json_for_update');
		} finally {
			busy = null;
		}
	}

	const itemClass =
		'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-sunken disabled:opacity-40';
</script>

<input
	type="file"
	accept=".json,application/json"
	class="hidden"
	bind:this={fileInputRef}
	onchange={handleFileSelect}
/>

<UpdateDiffSheet bind:open={diffSheetOpen} diff={currentDiff} onconfirm={confirmUpdate} />

<Popover bind:open align="end" label={t('trip_data_and_exports')}>
	{#snippet trigger({ toggle, open: isOpen })}
		<button
			type="button"
			onclick={toggle}
			aria-haspopup="true"
			aria-expanded={isOpen}
			aria-label={t('trip_data_and_exports')}
			class="grid size-11 min-h-[44px] min-w-[44px] place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 sm:size-9 sm:min-h-0 sm:min-w-0 [&_svg]:size-5 sm:[&_svg]:size-4"
		>
			<MoreVertical />
		</button>
	{/snippet}

	<div class="w-60 p-1">
		{#if onedit || onshare}
			<div class="mb-1 border-b border-border pb-1 sm:hidden">
				{#if onshare}
					<button
						type="button"
						class={itemClass}
						onclick={() => {
							open = false;
							onshare?.();
						}}
					>
						<Share2 class="size-4" />
						<span>{t('share')}</span>
					</button>
				{/if}
				{#if onedit}
					<button
						type="button"
						class={itemClass}
						onclick={() => {
							open = false;
							onedit?.();
						}}
					>
						<Pencil class="size-4" />
						<span>{t('edit')}</span>
					</button>
				{/if}
			</div>
		{/if}

		<p class="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted/80">
			{t('export')}
			{title ? `"${title}"` : ''}
		</p>

		<button type="button" class={itemClass} onclick={exportJson} disabled={!online || !!busy}>
			<FileDown />
			{busy === 'json' ? t('saving') : t('export_json')}
		</button>
		<button type="button" class={itemClass} onclick={exportPdf} disabled={!online || !!busy}>
			<FileText />
			{busy === 'pdf' ? t('saving') : t('printable_pdf')}
		</button>
		<a
			href={resolve('/trip/[id]/print', { id: tripid })}
			class={itemClass}
			onclick={() => (open = false)}
		>
			<Printer />
			<span>{t('print_or_pdf')}</span>
		</a>

		<div class="my-1 border-t border-border"></div>

		<p class="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted/80">
			{t('edit')}
		</p>

		{#if dream}
			<button type="button" class={itemClass} onclick={exportDreamTemplate} disabled={!!busy}>
				<FileJson />
				{busy === 'template' ? t('saving') : t('download_dream_template')}
			</button>
			<p class="px-2.5 pb-1.5 text-xs leading-snug text-ink-muted">
				{t('download_dream_template_hint')}
			</p>
		{/if}

		<button type="button" class={itemClass} onclick={triggerUpdateFile} disabled={!!busy}>
			<FileUp />
			{busy === 'update' ? t('loading') : t('update_from_json')}
		</button>
		<button
			type="button"
			class={itemClass}
			onclick={() => {
				pasteText = '';
				pasteError = '';
				pasteDialogOpen = true;
				open = false;
			}}
			disabled={!!busy}
		>
			<ClipboardPaste />
			{busy === 'paste' ? t('loading') : t('paste_json_update')}
		</button>

		{#if !online}
			<p
				class={cn(
					'mt-1 flex items-start gap-1.5 rounded-md bg-surface-sunken px-2.5 py-2 text-xs text-ink-muted',
					'&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0'
				)}
			>
				<WifiOff />
				<span>{t('exports_need_server')}</span>
			</p>
		{:else}
			<p class="mt-1 flex items-center gap-1.5 px-2.5 py-1 text-[0.7rem] text-ink-muted">
				<Download class="size-3" />
				{t('saved_to_device')}
			</p>
		{/if}
	</div>
</Popover>

<!-- Paste JSON dialog -->
<Dialog
	bind:open={pasteDialogOpen}
	title={t('paste_json_update')}
	description={t('paste_json_dialog_desc')}
>
	<div class="flex flex-col gap-3">
		<div class="flex items-center justify-between">
			{#if pasteText.trim()}
				<span class="text-xs font-medium {pasteJsonError ? 'text-destructive' : 'text-success'}">
					{pasteJsonError ? t('import_json_invalid') : t('import_json_valid')}
				</span>
			{:else}
				<span></span>
			{/if}
			<button
				type="button"
				onclick={pasteFromClipboard}
				class="text-xs font-medium text-primary-600 underline-offset-2 hover:underline"
			>
				{t('import_paste_from_clipboard')}
			</button>
		</div>

		<textarea
			value={pasteText}
			oninput={(e) => {
				pasteText = e.currentTarget.value;
				pasteError = '';
			}}
			placeholder={t('import_paste_placeholder')}
			rows="12"
			spellcheck="false"
			autocomplete="off"
			class="w-full resize-none rounded-md border border-border bg-surface p-3 font-mono text-xs text-ink transition-[box-shadow] placeholder:text-ink-muted focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30 {pasteText.trim() &&
			pasteJsonError
				? 'border-destructive ring-1 ring-destructive/30'
				: ''}"></textarea>

		{#if pasteError}
			<p class="text-xs text-destructive">{pasteError}</p>
		{/if}
	</div>

	{#snippet footer()}
		<button
			type="button"
			onclick={() => (pasteDialogOpen = false)}
			class="rounded-md px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-sunken"
		>
			{t('cancel')}
		</button>
		<button
			type="button"
			onclick={handlePasteUpdate}
			disabled={!pasteText.trim() || !!pasteJsonError || busy === 'paste'}
			class="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{busy === 'paste' ? t('saving') : t('update_paste_confirm')}
		</button>
	{/snippet}
</Dialog>
