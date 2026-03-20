# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Prisma Client generieren (eigener Layer – nur bei Schema-Änderung neu)
COPY prisma ./prisma
RUN npx prisma generate

COPY . .

# Produktions-Build (standalone output)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Build-Datum erst nach dem Build setzen (sonst Cache-Invalidierung bei jedem Build)
ARG BUILD_DATE
ENV BUILD_DATE=${BUILD_DATE}

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# OpenSSL für Prisma
RUN apk add --no-cache openssl

# Prisma CLI + Client für Migrationen zur Laufzeit
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Standalone Next.js Output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Uploads-Verzeichnis anlegen (wird per Volume überschrieben)
RUN mkdir -p ./data/uploads

# Seed-Script für initiale Benutzerverwaltung
COPY --from=builder /app/scripts ./scripts

# Entrypoint-Script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./docker-entrypoint.sh"]
