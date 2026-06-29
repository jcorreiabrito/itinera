"""Itinera FastAPI helper service.

A small, auxiliary Python service that adds "smarts" around the CouchDB source of
truth: JSON/attachment exports, printable per-trip PDFs, scheduled backups and
housekeeping (compaction), plus startup provisioning of the ``itinera`` database
and the Mango indexes the app relies on.

It is **not** on the live PouchDB <-> CouchDB sync path (decision D8); the browser
syncs directly to CouchDB through Caddy. This service is reached at `/api`.
"""

__version__ = "0.1.0"