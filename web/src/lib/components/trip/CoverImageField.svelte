<script lang="ts" module>
</script>

<script lang="ts">
	import { attachments, fullTripid, trips } from '$lib/db';
	import {
		AttachmentTooLargeError,
		MAX_ATTACHMENT_LABEL,
		StorageQuotaError
	} from '$lib/db/repositories/attachments';
	import { ImagePlus, Loader2, Trash2 } from 'lucide-svelte';
	import { Button, toast } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import TripCover from './TripCover.svelte';

	interface Props {
		/** Trip Id (bare ULID or full `trip:` form). */
		tripId: string;
		attId: string | null;
		title?: string;
		/** Fired after the cover changes so the parent can refresh. */
		onchange: (attId: string | null) => void;
	}

	let { tripId, attId = null, title = '', onchange }: Props = $props();

	/*
	 * Mirrors the `attId` prop, and is written optimistically after an upload
	 * or removal. A writable `$derived` keeps the preview in step with the prop
	 * without the extra render pass `$state` + `$effect` would need.
	 */
	let localAttId = $derived(attId);
	let uploading = $state(false);
	let inputEl = $state<HTMLInputElement>();

	async function onFile(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			toast.error(t('choose_image_file'));
			event.currentTarget.value = '';
			return;
		}
		uploading = true;
		try {
			const att = await attachments.create({
				tripid: tripId,
				ownerType: 'trip',
				ownerId: fullTripid(tripId),
				file,
				resizeImages: true
			});
			await trips.setCover(tripId, att._id);
			localAttId = att._id;
			onchange(att._id);
			toast.success(t('cover_photo_updated'));
		} catch (err) {
			/*
			 * Typed failures, not message text: an oversized photo is the user's to fix
			 * by picking another one, a full device only by freeing space — and neither
			 * is helped by the generic "try another" copy.
			 */
			if (err instanceof AttachmentTooLargeError) {
				toast.error(t('attachment_too_large', { max: MAX_ATTACHMENT_LABEL }));
			} else if (err instanceof StorageQuotaError) {
				toast.error(t('storage_full_remove_files'));
			} else {
				toast.error(t('could_not_upload_image'));
			}
		} finally {
			uploading = false;
			if (inputEl) inputEl.value = '';
		}
	}

	async function removeCover() {
		uploading = true;
		try {
			await trips.setCover(tripId, null);
			localAttId = null;
			onchange(null);
		} catch {
			toast.error(t('could_not_remove_cover'));
		} finally {
			uploading = false;
		}
	}
</script>

<div class="flex items-center gap-3">
	<div class="relative size-20 shrink-0 overflow-hidden rounded-md">
		<TripCover attId={localAttId} blob="thumb" {title} class="size-full" />
		{#if uploading}
			<div class="absolute inset-0 grid place-items-center bg-ink/40 text-white" aria-hidden="true">
				<Loader2 class="size-5 animate-spin" />
			</div>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<Button variant="secondary" size="sm" onclick={() => inputEl?.click()} disabled={uploading}>
			<ImagePlus class="size-4" />
			{localAttId ? t('change_photo') : t('add_photo')}
		</Button>
		{#if localAttId}
			<Button variant="ghost" size="sm" onclick={removeCover} disabled={uploading}>
				<Trash2 class="size-4" />
				{t('remove')}
			</Button>
		{/if}

		<input
			bind:this={inputEl}
			type="file"
			accept="image/*"
			class="hidden"
			aria-label={t('upload_cover_photo')}
			onchange={onFile}
		/>
	</div>
</div>
