/**
 * Die tatsächliche Oberfläche der App, aus dem Quelltext gelesen: welche API-Routen es gibt und
 * welche MCP-Werkzeuge registriert sind.
 *
 * Wozu: der Funktionskatalog (`funktionsmodellCapabilities.ts`) ist von Hand geschrieben — „was kann
 * man tun" ist eine Beurteilung, keine Ableitung. Eine handgeschriebene Liste von Funktionen ist aber
 * genau die Sorte Dokument, die still unvollständig wird: eine neue Route kommt dazu, niemand denkt
 * an den Katalog, und die Lücke sieht aus wie Vollständigkeit.
 *
 * Deshalb wird der Katalog gegen DIESE Inventare geprüft. Jede Route und jedes Werkzeug muss von
 * einer Funktion beansprucht oder ausdrücklich ausgenommen sein; umgekehrt darf keine Funktion auf
 * etwas verweisen, das es nicht mehr gibt. Damit ist die Vollständigkeit eine Test-Aussage statt
 * eines Vorsatzes.
 *
 * Bewusst ein Zeilen-Scanner statt einer echten Analyse: er läuft ohne Build, ohne generierten
 * Prisma-Client und ohne laufenden Server — also auch im frischen Klon und im CI-Gate.
 */
import fs from "node:fs";
import path from "node:path";

/** Eine API-Route mit den HTTP-Methoden, die sie exportiert. */
export interface ApiRoute {
  /** Öffentlicher Pfad, z.B. `/api/admin/kontrolle`. */
  route: string;
  methods: string[];
}

const HTTP_EXPORT = /export\s+(?:const|async\s+function)\s+(GET|POST|PATCH|PUT|DELETE)\b/g;
/** `.registerTool(` samt Namen — der steht heute in der Folgezeile, `\s*` deckt auch dieselbe ab.
 *
 *  Der PUNKT gehört ins Muster, der Empfängername bewusst nicht: `route.ts` enthält seit dem
 *  Werkzeug-Fingerabdruck auch eine `registerTool`-IMPLEMENTIERUNG (der Sammler in
 *  `measureToolSurface`), und die ist keine Registrierung. Eine Methoden-Definition hat keinen
 *  Punkt davor, ein Aufruf immer — damit fällt sie heraus, ohne dass die Prüfung sich auf den Namen
 *  `server` festlegt. Täte sie das, entginge ihr ein Aufruf über eine anders benannte Variable
 *  gleich doppelt (weder gezählt noch gelesen), und die Lücke bliebe still. */
const MCP_TOOL = /\.registerTool\(\s*"([a-z_]+)"/g;
/** Jede Registrierung, unabhängig davon, wie der Name danach formatiert ist. */
const MCP_TOOL_CALL = /\.registerTool\(/g;

/** Alle `route.ts` unterhalb eines Verzeichnisses, aufsteigend sortiert. */
function routeFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) routeFiles(p, out);
    else if (e.name === "route.ts") out.push(p);
  }
  return out.sort();
}

/** Die API-Routen des Projekts. `root` ist das Projektverzeichnis. */
export function readApiRoutes(root: string): ApiRoute[] {
  const base = path.join(root, "src/app/api");
  return routeFiles(base).map((file) => {
    const rel = path.relative(base, path.dirname(file));
    const source = fs.readFileSync(file, "utf8");
    return {
      route: `/api${rel ? "/" + rel.split(path.sep).join("/") : ""}`,
      methods: [...new Set([...source.matchAll(HTTP_EXPORT)].map((m) => m[1]))].sort(),
    };
  });
}

/**
 * Die registrierten MCP-Werkzeuge, in Registrierungs-Reihenfolge.
 *
 * Wirft, wenn nicht jede Registrierung einen Namen hergibt. Das ist der wichtige Teil: ein
 * Zeilen-Scanner scheitert an einer Umformatierung nicht laut, sondern LEISE — er findet dann
 * weniger Werkzeuge, und weniger gefundene sind vom Katalog restlos abgedeckt. Der Test wäre grün
 * und hätte die Hälfte nicht angesehen. Der Abgleich mit der reinen Aufruf-Zählung schliesst das aus.
 */
export function readMcpTools(root: string): string[] {
  const source = fs.readFileSync(path.join(root, "src/app/api/[transport]/route.ts"), "utf8");
  const names = [...source.matchAll(MCP_TOOL)].map((m) => m[1]);
  const calls = [...source.matchAll(MCP_TOOL_CALL)].length;
  if (names.length !== calls) {
    throw new Error(
      `MCP-Werkzeuge: ${calls} Registrierungen, aber nur ${names.length} Namen gelesen — ` +
      "die Schreibweise in route.ts hat sich geändert, MCP_TOOL in funktionsmodellSurfaces.ts anpassen.",
    );
  }
  return names;
}
