#!/bin/sh
set -e

echo "→ Datenbankmigrationen anwenden..."
# init-Migration als applied markieren falls sie wegen bereits existierender Tabellen (db push) fehlschlug
DATABASE_URL="file:/app/data/prod.db" npx prisma migrate resolve --applied "20260312204854_init" --schema ./prisma/schema.prisma 2>/dev/null || true
DATABASE_URL="file:/app/data/prod.db" npx prisma migrate deploy --schema ./prisma/schema.prisma

echo "→ Admin-User anlegen (falls nötig)..."
DATABASE_URL="file:/app/data/prod.db" node scripts/seed.js

echo "→ App starten..."
exec node server.js
