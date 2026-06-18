# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install build tools needed for native modules (bcrypt)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --ignore-scripts && \
    npm rebuild bcrypt --build-from-source

# ── Stage 2: production image ──────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S backend -u 1001 -G nodejs

# Copy only production deps
COPY --from=deps --chown=backend:nodejs /app/node_modules ./node_modules

# Copy application source
COPY --chown=backend:nodejs . .

# Create log directory with correct permissions
RUN mkdir -p logs && chown backend:nodejs logs

USER backend

EXPOSE 4000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4000/healthz || exit 1

CMD ["node", "src/server.js"]
