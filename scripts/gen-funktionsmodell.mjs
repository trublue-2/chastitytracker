/**
 * Erzeugt `docs/funktionsmodell/stellschrauben.md` aus `prisma/schema.prisma` +
 * `src/lib/funktionsmodellRegistry.ts`.
 *
 *   npm run funktionsmodell
 *
 * Warum der Umweg über Vite: die Logik liegt in TypeScript, weil `funktionsmodellDoc.test.ts` sie
 * prüfen muss — und Prüfung und Erzeugung MÜSSEN dieselben Funktionen benutzen, sonst kann der Test
 * grün sein und die erzeugte Datei trotzdem falsch. `node` allein lädt diese Module nicht (es
 * verlangt Dateiendungen in Import-Pfaden, die der Rest des Projekts nicht schreibt), `tsx` ist keine
 * Abhängigkeit. Vite liegt über Vitest ohnehin im Baum und löst genau so auf wie der Test.
 */
import { createServer } from "vite";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outputs = [
  ["docs/funktionsmodell/stellschrauben.md", (doc, schema) => doc.renderStellschrauben(schema)],
  ["docs/funktionsmodell/05-abhaengigkeiten.md", (doc) => doc.renderAbhaengigkeiten()],
  ["docs/funktionsmodell/01-funktionen.md", (doc) => doc.renderFunktionen()],
];

const server = await createServer({
  root,
  configFile: false,
  logLevel: "warn",
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const doc = await server.ssrLoadModule("/src/lib/funktionsmodellDoc.ts");
  const schema = doc.parsePrismaSchema(await fs.readFile(path.join(root, "prisma/schema.prisma"), "utf8"));

  // Erst prüfen, dann schreiben. Ein Register mit Lücken zu generieren wäre schlimmer als keines:
  // die Tabelle sähe vollständig aus und wäre es nicht.
  const problems = doc.checkRegistry(schema);
  const complaints = Object.entries(problems).filter(([, list]) => list.length > 0);
  if (complaints.length > 0) {
    for (const [kind, list] of complaints) console.error(`${kind}: ${list.join(", ")}`);
    console.error("\nRegistry ergänzen (src/lib/funktionsmodellRegistry.ts), dann erneut ausführen.");
    process.exitCode = 1;
  } else {
    for (const [rel, render] of outputs) {
      await fs.writeFile(path.join(root, rel), render(doc, schema), "utf8");
      console.log(`geschrieben: ${rel}`);
    }
  }
} finally {
  await server.close();
}
