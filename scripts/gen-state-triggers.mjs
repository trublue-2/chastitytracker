/**
 * Gibt das Trigger-SQL für `StateVersion` aus (Register: `src/lib/mcp/stateAreas.ts`).
 *
 *   npm run state-triggers > /tmp/triggers.sql
 *
 * Gebraucht, wenn `stateAreas.test.ts` meldet, dass die jüngste Trigger-Migration nicht mehr zum
 * Register passt: neue Migration anlegen (`prisma migrate dev --create-only`) und die Ausgabe dort
 * hineinkopieren. Vite statt `node`/`tsx` aus demselben Grund wie in `gen-funktionsmodell.mjs`.
 */
import { createServer } from "vite";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const server = await createServer({
  root, configFile: false, logLevel: "warn", server: { middlewareMode: true }, appType: "custom",
});
try {
  const doc = await server.ssrLoadModule("/src/lib/prismaSchema.ts");
  const areas = await server.ssrLoadModule("/src/lib/mcp/stateAreas.ts");
  const schema = doc.parsePrismaSchema(await fs.readFile(path.join(root, "prisma/schema.prisma"), "utf8"));
  process.stdout.write(areas.buildStateTriggerSql(schema));
} finally {
  await server.close();
}
