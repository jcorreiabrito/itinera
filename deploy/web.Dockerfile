# web.Dockerfile — serve the pre-built SvelteKit PWA via a Caddy image.
#
# Build context MUST be the repo root `itinera/` (see docker-compose.yml) so the
# build can COPY web/build/ (the pre-built PWA static files) and deploy/ (the Caddy config + entrypoint).
#
# Before building:
#   cd web && pnpm install && pnpm build

FROM caddy:2-alpine

# Copy the pre-built static SPA from the host
COPY web/build /srv

# Caddy config + credential-injecting entrypoint (paths are relative to the build
# context root = `itinera/`).
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/caddy-entrypoint.sh /usr/local/bin/itinera-entrypoint.sh

# Normalize possible CRLF (Windows checkouts) and make the entrypoint executable.
RUN sed -i 's/\r$//' /usr/local/bin/itinera-entrypoint.sh \
    && chmod +x /usr/local/bin/itinera-entrypoint.sh

EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/itinera-entrypoint.sh"]