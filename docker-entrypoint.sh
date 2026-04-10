#!/bin/sh
set -e

# data/-Verzeichnis gehört nach einem Docker-Volume-Mount oft root.
# www-data (uid=33) braucht Schreibrechte um prod.db anlegen zu können.
chown -R www-data:www-data /app/data 2>/dev/null || chmod -R a+w /app/data 2>/dev/null || true

PRISMA_CLI="node ./node_modules/prisma/build/index.js"
export DATABASE_URL="file:/app/data/prod.db"

# ── Startup-Diagnose ────────────────────────────────────────────────────────
echo "┌─────────────────────────────────────────────────────┐"
echo "│  STARTUP DIAGNOSE                                   │"
printf "│  ADMIN_USERNAME : %-34s│\n" "${ADMIN_USERNAME:-'(nicht gesetzt → admin)'}"
printf "│  ADMIN_EMAIL    : %-34s│\n" "${ADMIN_EMAIL:-'(nicht gesetzt → null)'}"
if [ -n "$ADMIN_PASSWORD" ]; then
  printf "│  ADMIN_PASSWORD : %-34s│\n" "(gesetzt, ${#ADMIN_PASSWORD} Zeichen)"
else
  printf "│  ADMIN_PASSWORD : %-34s│\n" "(nicht gesetzt → admin123)"
fi
printf "│  NEXTAUTH_URL   : %-34s│\n" "${NEXTAUTH_URL:-'(nicht gesetzt)'}"
printf "│  DATABASE_URL   : %-34s│\n" "file:/app/data/prod.db"
printf "│  data/ owner    : %-34s│\n" "$(stat -c '%U (%u)' /app/data 2>/dev/null || echo '?')"
echo "└─────────────────────────────────────────────────────┘"
# ───────────────────────────────────────────────────────────────────────────

echo "→ Datenbankmigrationen anwenden..."
# init-Migration als applied markieren falls sie wegen bereits existierender Tabellen fehlschlug
su-exec www-data sh -c "$PRISMA_CLI migrate resolve --applied '20260312204854_init' --schema ./prisma/schema.prisma" 2>/dev/null || true
su-exec www-data sh -c "$PRISMA_CLI migrate deploy --schema ./prisma/schema.prisma"

echo "→ Admin-User anlegen (falls nötig)..."
su-exec www-data sh -c "node scripts/seed.js"

echo "→ App starten..."
exec su-exec www-data node server.js
