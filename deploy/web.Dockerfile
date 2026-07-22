# web.Dockerfile — Multi-stage build that compiles the SvelteKit PWA and serves via Caddy.
#
# Build context MUST be the repo root `itinera/` (see docker-compose.yml) so the
# build can COPY web/ and deploy/.

# Stage 1: Build the SvelteKit static SPA
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package definitions first for Docker layer caching
COPY web/package.json web/pnpm-lock.yaml* web/package-lock.json* ./

# Install dependencies cleanly inside the container
RUN npm install

# Copy frontend source code (node_modules is ignored via .dockerignore)
COPY web/ ./

# Sync svelte-kit types and build static SPA via vite
RUN npx svelte-kit sync && npx vite build

# Stage 2: Bake built SPA into Caddy image
FROM caddy:2-alpine

# Copy built static files from builder stage
COPY --from=builder /app/build /srv

# Caddy config + credential-injecting entrypoint
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/caddy-entrypoint.sh /usr/local/bin/itinera-entrypoint.sh

# Normalize CRLF and set executable permissions
RUN sed -i 's/\r$//' /usr/local/bin/itinera-entrypoint.sh \
    && chmod +x /usr/local/bin/itinera-entrypoint.sh

EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/itinera-entrypoint.sh"]