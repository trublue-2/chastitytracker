#!/bin/sh
set -e

echo "→ Datenbankmigrationen anwenden..."
# init-Migration als applied markieren falls sie wegen bereits existierender Tabellen (db push) fehlschlug
# Direct node invocation statt npx — spart 3-8 Sek. npx-Resolution pro Container-Start
PRISMA_CLI="node ./node_modules/prisma/build/index.js"
DATABASE_URL="file:/app/data/prod.db" $PRISMA_CLI migrate resolve --applied "20260312204854_init" --schema ./prisma/schema.prisma 2>/dev/null || true
DATABASE_URL="file:/app/data/prod.db" $PRISMA_CLI migrate deploy --schema ./prisma/schema.prisma

echo "→ Admin-User anlegen (falls nötig)..."
DATABASE_URL="file:/app/data/prod.db" node scripts/seed.js

echo "→ App starten..."
exec node server.js
