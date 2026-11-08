import { describe, it, expect } from "vitest";
import { listFiles, readStripped } from "@/test/sourceScan";

/**
 * Muster, die in diesem Baum nichts zu suchen haben — als Dateiscan, weil jede dieser Regeln
 * schon einmal in CLAUDE.md stand und trotzdem übersehen werden kann. Bauart nach
 * `nestedComponents.test.ts`: den Baum lesen statt eine Dateiliste pflegen, vor dem Vergleich die
 * Kommentare entfernen (die Begründungen nennen die gesuchten Muster selbst).
 *
 * Eine Ausnahme gehört in die Liste unten, MIT Begründung — nicht in eine Aufweichung des Musters.
 */
const SRC = listFiles("src", (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));

function scan(files: string[], re: RegExp, allow: Record<string, string> = {}): string[] {
  const hits: string[] = [];
  for (const f of files) {
    if (f in allow) continue;
    readStripped(f).split("\n").forEach((line, i) => {
      if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  return hits;
}

describe("verbotene Muster", () => {
  it("findet den Baum — sonst prüft der Test nichts", () => {
    expect(SRC.length).toBeGreaterThan(300);
  });

  it("keine synchronen FS-/Prozess-Aufrufe in den API-Routen (blockieren den Event-Loop)", () => {
    // `\b…\b` mit der vollen Namensliste: `requireBoxSync(` ist KEIN Treffer.
    const SYNC = /\b(readFileSync|writeFileSync|appendFileSync|rmSync|rmdirSync|unlinkSync|mkdirSync|readdirSync|statSync|lstatSync|existsSync|copyFileSync|renameSync|execSync|execFileSync|spawnSync)\b/;
    expect(scan(SRC.filter((f) => f.startsWith("src/app/api/")), SYNC)).toEqual([]);
  });

  it("kein require() — ES-Imports", () => {
    expect(scan(SRC, /(^|[^.\w])require\(/)).toEqual([]);
  });

  it("X-Forwarded-For und X-Real-IP werden nur im IP-Helfer gelesen", () => {
    // Der erste Eintrag von X-Forwarded-For ist vom Aufrufer wählbar (Traefik hängt die echte IP ans
    // ENDE) — jede zweite Kopie der Auslese ist eine Stelle, an der das wieder falsch werden kann.
    const allow = { "src/lib/auth/clientIp.ts": "der EINE Helfer" };
    expect(scan(SRC, /x-forwarded-for|x-real-ip/i, allow)).toEqual([]);
  });

  it("kein Math.random() dort, wo es um Anmeldung, Sitzungen und Tokens geht", () => {
    const SECURITY = SRC.filter((f) =>
      /^src\/lib\/(auth|login-attempts|loginIdentity|oauth|webauthn|secretBox|passwordAudit|boxSync)/.test(f) ||
      f.startsWith("src/app/api/oauth/") || f.startsWith("src/app/api/auth/") || f.startsWith("src/app/api/portal-login/"),
    );
    expect(SECURITY.length).toBeGreaterThan(5);
    expect(scan(SECURITY, /Math\.random\(/)).toEqual([]);
  });

  it("der Kontroll-Code entsteht nicht aus Math.random()", () => {
    // Er ist der Frischenachweis einer Foto-Kontrolle — vorhersagbar hiesse: vorab fotografierbar.
    // utils.ts darf Math.random sonst behalten (`randomInt` bekommt die Quelle als Parameter).
    const src = readStripped("src/lib/shared/utils.ts");
    const start = src.indexOf("export function generateKontrollCode");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("\n}\n", start));
    expect(body).not.toMatch(/Math\.random/);
    expect(body).toMatch(/getRandomValues/);
  });

  it("kein natives confirm()/prompt() — die App-Dialoge (ConfirmDialog, ActionModal) tragen die Rückfragen", () => {
    expect(scan(SRC, /(^|[^.\w])(window\.)?(confirm|prompt)\(/, { "src/app/components/InstallBanner.tsx": "Deklaration von BeforeInstallPromptEvent.prompt()" })).toEqual([]);
  });

  it("signOut() von next-auth wird nur im Hook useSignOut aufgerufen (Rückfrage + Cache-Leerung)", () => {
    expect(scan(SRC, /\bsignOut\(/, { "src/app/hooks/useSignOut.tsx": "der EINE Weg" })).toEqual([]);
  });
});
