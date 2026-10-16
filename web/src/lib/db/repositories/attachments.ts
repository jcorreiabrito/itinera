/**
 * Attachments repository – booking PDFs, confirmation images and trip covers.
 *
 * Each attachment is its **own document** (`att:{tripId}:{uid}`) with the
 * bytes in CouchDB `_attachments`, so large binaries replicate for offline
 * viewing without forcing frequently-edited docs to re-sync (see
 * `docs/05-offline-and-sync.md`). Large images are **client-resized** before
 * save: covers get both a `full` (~1600px) and `thumb` (~480px) blob. Everything
 * is capped at {@link MAX_ATTACHMENT_BYTES}, and a write the browser rejects for
 * want of room comes back as {@link StorageQuotaError} – the two failures the UI
 * must explain rather than swallow.
 *
 * Bytes are read back as object URLs for offline viewing. Because a `blob:` URL
 * inherits the app origin, the **view path coerces the URL's MIME** to the
 * inline-render allowlist (`@link safeViewMime`); only those types may be shown
 * inline by the UI (gate on `@link isInlineRenderable`). See `attachment-mime`
 * and the "Attachment view safety" section of the db README for the contract
 * the Phase 3 viewer MUST follow.
 */

import { createDoc, getDoc, listTripDocs, patchDoc, purgeDoc, softDeleteDoc } from '../base';
import { attachmentId, fullTripid } from '../ids';
import { getDb, type Database } from '../pouch';
import type { Attachment } from '../schemas';

import { safeViewMime } from './attachment-mime';
export { isInlineRenderable } from './attachment-mime';

/** Default longest-edge sizes (px) for resized images. */
export const COVER_FULL_EDGE = 1600;
export const COVER_THUMB_EDGE = 480;
/** Skip resizing images already smaller than this many bytes. */
const RESIZE_BYTE_THRESHOLD = 200_000;

/**
 * Hard ceiling on one attachment's bytes, enforced *before* anything reads them.
 *
 * 25 MB is chosen for what this app actually stores – photos and boarding-pass
 * PDFs, not video. Images above {@link RESIZE_BYTE_THRESHOLD} are downscaled
 * client-side, so no legitimate photo comes near it; a huge JPEG or PNG is
 * shrunk long before the write. What does come near it (a phone video, a RAW
 * file) is exactly what must be refused: the local database shares one origin
 * quota with the whole app, so a single 200 MB blob would consume it, make
 * every *other* write and the background sync fail, and the failure would
 * surface only after the bytes had been read into memory.
 *
 * `Blob.size` is metadata, so the check is free.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * {@link MAX_ATTACHMENT_BYTES} pre-formatted for user-facing copy ("25 MB").
 *
 * The app's one byte formatter is `formatBytes` in `src/routes/settings/+page.svelte`,
 * private to that page, so the label is derived from the constant here instead
 * of duplicated as a literal in each locale file: it matches that formatter's
 * output for this value (whole megabytes) and can never drift from the cap the
 * guard enforces.
 */
export const MAX_ATTACHMENT_LABEL = `${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`;

/** A file the caller tried to attach that is over {@link MAX_ATTACHMENT_BYTES}. */
export class AttachmentTooLargeError extends Error {
	/** Size of the rejected file, in bytes. */
	readonly size: number;
	/** The limit that rejected it (always {@link MAX_ATTACHMENT_BYTES}). */
	readonly maxBytes: number;

	constructor(size: number, maxBytes: number = MAX_ATTACHMENT_BYTES) {
		super(`attachment is ${size} bytes; the limit is ${maxBytes}`);
		this.name = 'AttachmentTooLargeError';
		this.size = size;
		this.maxBytes = maxBytes;
	}
}

/**
 * The origin's storage is full: the browser refused the write, so nothing was
 * saved and retrying the same file cannot succeed until space is freed.
 */
export class StorageQuotaError extends Error {
	constructor(cause?: unknown) {
		super('local storage quota exceeded', { cause });
		this.name = 'StorageQuotaError';
	}
}

/**
 * Whether a storage failure means "this device is out of room".
 *
 * Every engine words it differently: Chromium and Firefox throw a DOMException
 * named `QuotaExceededError` (legacy code 22), Firefox's older storage stack
 * reports `NS_ERROR_DOM_QUOTA_REACHED` (code 1014), and the exception can cross
 * a realm boundary where `instanceof` is useless – so it is matched by name
 * **or** by code. Getting this wrong only hurts in one direction: a quota
 * failure misread as generic loses the one error the user can actually act on.
 */
export function isQuotaExceededError(err: unknown): boolean {
	const { name, code } = (err ?? {}) as { name?: unknown; code?: unknown };
	if (
		typeof name === 'string' &&
		(name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED')
	) {
		return true;
	}
	return typeof code === 'number' && (code === 22 || code === 1014);
}

/**
 * Map a failed write to the error a caller should see: a {@link StorageQuotaError}
 * when the browser refused it for lack of space, otherwise the original error
 * untouched. Anything unrecognised must stay as it was – reporting a schema or
 * conflict failure as a full disk would send the user off to delete files that
 * were never the problem.
 */
export function toStorageError(err: unknown): unknown {
	return isQuotaExceededError(err) ? new StorageQuotaError(err) : err;
}

/** {@link toStorageError}, as a `catch` block tail: always throws, never returns. */
function rethrowStorageError(err: unknown): never {
	throw toStorageError(err);
}

/** Input for creating an attachment. */
export interface NewAttachmentInput {
	tripid: string;
	/** What the attachment is attached to. */
	ownerType: 'trip' | 'flight' | 'reservation';
	/** The owner document id. */
	ownerId: string;
	/** The file/blob bytes. */
	file: File | Blob;
	/** Display filename (defaults to a `File.name`, else a generic name). */
	filename?: string;
	/** MIME type (defaults to the blob's type). */
	mime?: string;
	/** Resize large images into full+thumb blobs. Default true for images. */
	resizeImages?: boolean;
}

/**
 * Pure aspect-preserving resize maths: scale `(w, h)` so its longest edge is at
 * most `maxEdge`, never upscaling. Exposed for unit testing.
 */
export function computeResizeDimensions(
	w: number,
	h: number,
	maxEdge: number
): { width: number; height: number } {
	if (w <= 0 || h <= 0) return { width: 0, height: 0 };
	const longest = Math.max(w, h);
	if (longest <= maxEdge) return { width: Math.round(w), height: Math.round(h) };
	const scale = maxEdge / longest;
	return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function canResizeImages(): boolean {
	return (
		typeof document !== 'undefined' &&
		typeof createImageBitmap === 'function' &&
		typeof HTMLCanvasElement !== 'undefined'
	);
}

async function resizeImage(blob: Blob, maxEdge: number): Promise<Blob> {
	const bitmap = await createImageBitmap(blob);
	const { width, height } = computeResizeDimensions(bitmap.width, bitmap.height, maxEdge);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return blob;
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();
	return new Promise<Blob>((resolve) =>
		canvas.toBlob((b) => resolve(b ?? blob), 'image/jpeg', 0.85)
	);
}

interface NamedBlob {
	name: string;
	blob: Blob;
	type: string;
}

async function prepareBlobs(
	file: File | Blob,
	mime: string,
	resizeImages: boolean
): Promise<NamedBlob[]> {
	const isImage = mime.startsWith('image/');
	const big = file.size > RESIZE_BYTE_THRESHOLD;
	if (isImage && resizeImages && big && canResizeImages()) {
		const [full, thumb] = await Promise.all([
			resizeImage(file, COVER_FULL_EDGE),
			resizeImage(file, COVER_THUMB_EDGE)
		]);
		return [
			{ name: 'full', blob: full, type: 'image/jpeg' },
			{ name: 'thumb', blob: thumb, type: 'image/jpeg' }
		];
	}
	return [{ name: 'file', blob: file, type: mime || 'application/octet-stream' }];
}

/**
 * Create an attachment document with its bytes inline in `_attachments`.
 * Images larger than the threshold are resized into `full`+`thumb` blobs; other
 * files are stored as a single `file` blob.
 *
 * Rejects with {@link AttachmentTooLargeError} before reading anything when the
 * file is over {@link MAX_ATTACHMENT_BYTES}, and with {@link StorageQuotaError}
 * when the browser refuses the write because the origin is out of storage – two
 * failures a caller can tell apart from any other, and can explain to the user.
 */
export async function create(input: NewAttachmentInput): Promise<Attachment> {
	// Checked first, and from metadata: resize/encode below would decode the
	// whole file into memory, and a refusal should cost neither memory nor time.
	if (input.file.size > MAX_ATTACHMENT_BYTES) {
		throw new AttachmentTooLargeError(input.file.size);
	}

	const mime = input.mime ?? input.file.type ?? 'application/octet-stream';
	const filename = input.filename ?? (input.file instanceof File ? input.file.name : 'attachment');
	const blobs = await prepareBlobs(input.file, mime, input.resizeImages ?? true);

	const _attachments: Record<string, { content_type: string; data: Blob }> = {};
	for (const b of blobs) _attachments[b.name] = { content_type: b.type, data: b.blob };

	const _id = attachmentId(input.tripid);
	const doc = {
		_id,
		type: 'attachment' as const,
		tripid: fullTripid(input.tripid),
		filename,
		mime,
		// Derived, view-safe type: the original mime when inline-renderable, else
		// 'application/octet-stream'. The original `mime` + bytes are kept intact.
		safeMime: safeViewMime(mime),
		size: input.file.size,
		ownerType: input.ownerType,
		ownerId: input.ownerId,
		_attachments
	};
	try {
		return await createDoc<Attachment>(
			doc as unknown as Parameters<typeof createDoc<Attachment>>[0]
		);
	} catch (err) {
		rethrowStorageError(err);
	}
}

/** Fetch an attachment document (metadata; bytes are loaded via {@link objectUrl}). */
export function get(id: string): Promise<Attachment | null> {
	return getDoc<Attachment>(id);
}

/** All attachments for a trip. */
export function byTrip(tripid: string): Promise<Attachment[]> {
	return listTripDocs<Attachment>('attachment', tripid);
}

/** Attachments belonging to a specific owner (flight/reservation/trip). */
export async function forOwner(tripid: string, ownerId: string): Promise<Attachment[]> {
	return (await byTrip(tripid)).filter((a) => a.ownerId === ownerId);
}

/** Re-point an attachment at a different owner. */
export function setOwner(
	id: string,
	ownerType: 'trip' | 'flight' | 'reservation',
	ownerId: string
): Promise<Attachment> {
	return patchDoc<Attachment>(id, { ownerType, ownerId });
}

/** The preferred blob name to display for an attachment (cover thumb vs file). */
export async function pickBlobName(
	id: string,
	prefer: 'thumb' | 'full' | 'file' = 'file',
	db: Database = getDb()
): Promise<string | null> {
	const doc = (await db.get(id)) as unknown as { _attachments?: Record<string, unknown> };
	const names = doc._attachments ? Object.keys(doc._attachments) : [];
	if (names.length === 0) return null;
	if (names.includes(prefer)) return prefer;
	return names.includes('file') ? 'file' : names[0];
}

/**
 * Read an attachment's bytes as an object URL for **offline** viewing. Remember
 * to {@link revokeObjectUrl} when the element is destroyed. `name` selects the
 * blob (`thumb`/`full`/`file`); omit to auto-pick.
 *
 * **Security:** the returned URL's MIME is coerced via {@link safeViewMime}, so
 * a non-allowed attachment (svg/html/xhtml/unknown) is advertised as
 * `application/octet-stream` and can only be downloaded – never executed inline
 * on the app origin. The stored bytes are untouched (a re-typed Blob wraps the
 * same data). The UI must still gate inline rendering on {@link isInlineRenderable}.
 */
export async function objectUrl(
	id: string,
	name?: string,
	db: Database = getDb()
): Promise<string | null> {
	const blobName = name ?? (await pickBlobName(id, 'file', db));
	if (!blobName) return null;
	const blob = (await db.getAttachment(id, blobName)) as Blob;
	const viewType = safeViewMime(blob.type ?? '');
	const safe = blob.type === viewType ? blob : new Blob([blob], { type: viewType });
	return URL.createObjectURL(safe);
}

/** Revoke an object URL created by {@link objectUrl}. */
export function revokeObjectUrl(url: string): void {
	URL.revokeObjectURL(url);
}

/** Soft-delete an attachment (Trash can restore it). */
export function remove(id: string): Promise<Attachment> {
	return softDeleteDoc<Attachment>(id);
}

/** Permanently delete an attachment and its bytes. */
export function purge(id: string): Promise<void> {
	return purgeDoc(id);
}
