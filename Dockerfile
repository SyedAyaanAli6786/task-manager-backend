# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: Dependency installation
# ──────────────────────────────────────────────────────────────────────────────
FROM node:18-alpine AS deps

WORKDIR /app

# Copy only lockfiles first for optimal layer caching
COPY package*.json ./

# --ignore-scripts: prevent supply-chain attacks via postinstall hooks
# --only=production: exclude devDependencies from the runtime image
RUN npm ci --only=production --ignore-scripts

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime image
# ──────────────────────────────────────────────────────────────────────────────
FROM node:18-alpine AS runtime

# Metadata
LABEL org.opencontainers.image.title="task-manager-backend" \
      org.opencontainers.image.description="Node.js/Express task management REST API" \
      org.opencontainers.image.source="https://github.com/SyedAyaanAli6786/task-manager-backend"

WORKDIR /app

# Copy production node_modules from deps stage (no devDeps, no build tools)
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Expose the application port (matches PORT env var default in index.js)
EXPOSE 8080

# ── Security: run as the built-in non-root 'node' user ────────────────────────
# node:18-alpine ships UID 1000 'node'. Running as root inside a container
# violates least-privilege; if exploited the attacker gets root on the host.
USER node

# Build-time ARG so the image tag is baked in as APP_VERSION
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

# ── Docker-level health check ──────────────────────────────────────────────────
# K8s liveness/readiness probes are the primary health mechanism, but this
# ensures 'docker run' / 'docker-compose' also report container health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health/live || exit 1

# ── Entrypoint ────────────────────────────────────────────────────────────────
CMD ["node", "index.js"]