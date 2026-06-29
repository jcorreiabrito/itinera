/**
 * Attachment MIME safety – the inline-render allowlist.
 *
 * A `blob:` object URL **inherits the app origin**. If a hostile attachment
 * (`image/svg+xml`, `text/html`, `application/xhtml+xml`, ...) were rendered
 * inline – an `<iframe>` / `<object>` or a new tab pointed at its object URL – its
 * script would execute **same-origin** and could reach the admin-authed `/db`
 * proxy (stored XSS). To make that impossible at the data layer, only a small
 * allowlist of inert raster types (plus PDF) may ever be advertised for inline
 * rendering; every other type is coerced to `application/octet-stream` on the
 * view path so the browser can only **download** it, never execute it.
 *
 * Pure module (no PouchDB import) so it is unit-testable anywhere; consumed by
 * the attachments repository (`objectUrl`) and the Phase 3 viewer UI.
 *
 * @see docs/05-offline-and-sync.md (attachments)
 */

/** The fallback type for anything not safe to render inline. */
export const DOWNLOAD_ONLY_MIME = 'application/octet-stream';

/**
 * MIME types safe to render inline: inert rasters + PDF. **SVG is excluded** (it
 * is an XML/script container), as are `text/html` and `application/xhtml+xml`.
 */
export const INLINE_RENDERABLE_MIMES: ReadonlySet<string> = new Set([
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'application/pdf'
]);

/** Bare type/subtype, lower-cased and without parameters ("IMAGE/PNG; x" -> "image/png"). */
function mimeEssence(mime: string): string {
	return (mime ?? '').split(';')[0].trim().toLowerCase();
}

/**
 * True when `mime` may be rendered inline – i.e. shown in an `<img>` (rasters)
 * or a sandboxed PDF view. Case- and parameter-insensitive.
 *
 * The Phase 3 viewer MUST gate any inline display on this; non-allowlisted
 * types must be offered as a download only.
 */
export function isInlineRenderable(mime: string): boolean {
	return INLINE_RENDERABLE_MIMES.has(mimeEssence(mime));
}

/**
 * The MIME a Blob / object URL may safely advertise for **viewing**: the
 * original `mime` when it is inline-renderable, otherwise
 * `application/octet-stream` so the browser downloads (never executes) it.
 * The stored bytes and the original `mime` are left untouched.
 */
export function safeViewMime(mime: string): string {
	return isInlineRenderable(mime) ? mime : DOWNLOAD_ONLY_MIME;
}