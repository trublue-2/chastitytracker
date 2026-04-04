# Database Migration

Safely create and apply a Prisma migration. Argument: migration name.

## Steps

1. **Verify schema changes** — Read `prisma/schema.prisma` and confirm what changed vs. the current DB state
2. **Create migration** — Run:
   ```bash
   DATABASE_URL="file:./dev.db" npx prisma migrate dev --name $ARGUMENTS
   ```
3. **Regenerate client** — Run:
   ```bash
   npx prisma generate
   ```
4. **Type check** — Run `npx tsc --noEmit` to verify no type errors from schema changes
5. **Report** — Show the generated SQL from `prisma/migrations/*/migration.sql` and confirm success

## Common pitfalls

- **Always use `DATABASE_URL="file:./dev.db"`** as prefix — the `.env.local` file may not be loaded by Prisma CLI
- **Never skip `prisma generate`** after schema changes — TypeScript types will be stale
- **Check for data loss** — If a column is removed or renamed, warn before proceeding
- **Default values** — New required columns on existing tables need a default or the migration will fail on non-empty tables
