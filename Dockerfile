# ── ActBoard Server ────────────────────────────────────────────────────────────
# Build from repo root:  docker build -t actboard/server .
# Run standalone:        docker run -p 3141:3141 -v actboard_data:/app/data actboard/server
# ──────────────────────────────────────────────────────────────────────────────

# Stage 1: install production deps (needs build tools for better-sqlite3 native addon)
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts=false

# Stage 2: lean production image (~120MB)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3141
ENV HOST=0.0.0.0

# Copy compiled native modules from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy server source (routes, middleware, public dashboard, scripts)
COPY server/ ./

# Pre-create data dir; mount a volume here to persist the SQLite DB
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3141

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3141/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Default: start the server
CMD ["node", "index.js"]
