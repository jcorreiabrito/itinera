/**
 * Same-origin `/api` client – the **only** place the UI talks to the network.
 *
 * Everything else in the app reads and writes the local PouchDB through
 * `$lib/db`; this module reaches the FastAPI service (proxied by Caddy under
 * `/api`), permitted by the `connect-src 'self'` CSP purely for the
 * data-ownership features that genuinely need the home server: JSON / PDF
 * exports and server-side backups (`docs/14-roadmap.md`, NFR-5).
 *
 * These calls REQUIRE connectivity. Callers should gate the relevant controls
 * with `@link apiReachable` (and the `$syncStatus` store) and surface failures
 * with a toast + retry – every function here rejects with an `@link ApiError`
 * rather than throwing opaque network errors, and never crashes the app.
 */

const API_BASE = '/api';

/** A failed `/api` call, carrying the HTTP status when there was a response. */
export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** One server-side backup folder's metadata (`GET /api/backups`). */
export interface BackupSummary {
  name: string;
  createdAt?: string | null;
  sizeBytes?: number;
  docCount?: number;
  attachmentCount?: number;
}

/** Response of `GET /api/backups`. */
export interface BackupList {
  dir: string;
  backups: BackupSummary[];
}

/** Lightweight result of `POST /api/backups/run`. */
export interface BackupRunResult {
  name: string;
  createdAt?: string | null;
  db?: string;
  docCount?: number;
  attachmentCount?: number;
  attachmentsWritten?: number;
  failedAttachments?: { docId: string; name: string; error: string }[];
  path?: string;
  compacted?: boolean;
  pruned?: string[];
}

/**
 * Whether the network is (optimistically) reachable. The export/backup controls
 * also require `$syncStatus.state != 'offline'`; this is the cheap navigator
 * check that complements it (doc 05 "Sync status UX").
 */
export function apiReachable(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/** Pull a download filename out of a `Content-Disposition` header, if present. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/^"|"$/g, '')).trim();
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1].trim() ?? null;
}

/** Save a Blob to disk by clicking a transient object-URL anchor. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Fetch a binary/JSON document from `/api` and trigger a file download. */
async function downloadFrom(path: string, fallbackName: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { credentials: 'same-origin' });
  } catch {
    throw new ApiError('Could not reach your home server.');
  }
  if (!res.ok) {
    throw new ApiError(`Server responded ${res.status}.`, res.status);
  }
  const blob = await res.blob();
  const name = filenameFromDisposition(res.headers.get('Content-Disposition')) ?? fallbackName;
  saveBlob(blob, name);
}

/** Download one trip's full JSON export. */
export function downloadTripExport(tripid: string): Promise<void> {
  const slug = encodeURIComponent(tripid);
  return downloadFrom(`/trips/${slug}/export.json`, `itinera-${tripid.replace(/:/g, '-')}.json`);
}

/** Download the whole-database JSON export. */
export function downloadAllExport(): Promise<void> {
  return downloadFrom(`/export/all.json`, 'itinera-export.json');
}

/** Download a trip's printable PDF. */
export function downloadTripPdf(tripid: string): Promise<void> {
  const slug = encodeURIComponent(tripid);
  return downloadFrom(`/trips/${slug}/print.pdf`, `itinera-${tripid.replace(/:/g, '-')}.pdf`);
}

/** Read JSON from `/api`, normalising failures to `@link ApiError`. */
async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError('Could not reach your home server.');
  }
  if (!res.ok) {
    throw new ApiError(`Server responded ${res.status}.`, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError('The server sent an unexpected response.');
  }
}

/** Trigger a server-side backup now (`POST /api/backups/run`). */
export function runBackup(): Promise<BackupRunResult> {
  return getJson<BackupRunResult>('/backups/run', { method: 'POST' });
}

/** List existing server-side backups, newest first (`GET /api/backups`). */
export function listBackups(): Promise<BackupList> {
  return getJson<BackupList>('/backups');
}
