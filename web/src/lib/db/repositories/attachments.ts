/**
 * Attachments repository – booking PDFs, confirmation images and trip covers.
 *
 * Each attachment is its **own document** (`att:{tripId}:{uid}`) with the
 * bytes in CouchDB `_attachments`, so large binaries replicate for offline
 * viewing without forcing frequently-edited docs to re-sync (see
 * `docs/05-offline-and-sync.md`). Large images are **client-resized** before
 * save: covers get both a `full` (~1600px) and `thumb` (~480px) blob.
 *
 * Bytes are read back as object URLs for offline viewing. Because a `blob:` URL
 * inherits the app origin, the **view path coerces the URL's MIME** to the
 * inline-render allowlist (`@link safeViewMime`); only those types may be shown
 * inline by the UI (gate on `@link isInlineRenderable`). See `attachment-mime`
 * and the "Attachment view safety" section of the db README for the contract
 * the Phase 3 viewer MUST follow.
 */

import { createDoc, getDoc, listTripDocs, patchDoc, purgeDoc, softDeleteDoc } from './base';
import { attachmentId, fullTripid } from './ids';
import { getDb, type Database } from './pouch';
import type { Attachment } from './schemas';
import { safeViewMime } from './attachment-mime';

import {
  INLINE_RENDERABLE_MIMES,
  DOWNLOAD_ONLY_MIMES,
  isInlineRenderable,
  safeViewMime
} from './attachment-mime';

/** Default longest-edge sizes (px) for resized images. */
export const COVER_FULL_EDGE = 1600;
export const COVER_THUMB_EDGE = 480;
/** Skip resizing images already smaller than this many bytes. */
const RESIZE_BYTE_THRESHOLD = 200_000;

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
 */
export async function create(input: NewAttachmentInput): Promise<Attachment> {
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
  return createDoc<Attachment>(doc as unknown as Parameters<typeof createDoc<Attachment>>[0]);
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