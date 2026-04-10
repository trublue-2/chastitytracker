#!/bin/sh
set -e

# data/-Verzeichnis gehört nach einem Docker-Volume-Mount oft root.
# www-data (uid=33) braucht Schreibrechte um prod.db anlegen zu können.
chown -R www-data:www-data /app/data 2>/dev/null || chmod -R a+w /app/data 2>/dev/null || true

PRISMA_CLI="node ./node_modules/prisma/build/index.js"
DB="DATABASE_URL=file:/app/data/prod.db"

echo "→ Datenbankmigrationen anwenden..."
# init-Migration als applied markieren falls sie wegen bereits existierender Tabellen fehlschlug
su-exec www-data sh -c "$DB $PRISMA_CLI migrate resolve --applied '20260312204854_init' --schema ./prisma/schema.prisma" 2>/dev/null || true
su-exec www-data sh -c "$DB $PRISMA_CLI migrate deploy --schema ./prisma/schema.prisma"

echo "→ Admin-User anlegen (falls nötig)..."
su-exec www-data sh -c "$DB node scripts/seed.js"

echo "→ App starten..."
exec su-exec www-data node server.js
