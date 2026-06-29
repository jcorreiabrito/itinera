#!/bin/sh
set -e

# Derive the CouchDB Basic-auth header from the server-side admin credentials so
# the BROWSER never holds CouchDB secrets. Caddy injects this on every /db/*
# request (see Caddyfile -> header_up Authorization "Basic {env.COUCHDB_BASIC_AUTH}").
if [ -n "${COUCHDB_USER}" ] && [ -n "${COUCHDB_PASSWORD}" ]; then
    COUCHDB_BASIC_AUTH="$(printf '%s:%s' "${COUCHDB_USER}" "${COUCHDB_PASSWORD}" | base64 |
    export COUCHDB_BASIC_AUTH
else
    echo "WARNING: COUCHDB_USER/COUCHDB_PASSWORD not set – /db proxy will not authenticate."
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile