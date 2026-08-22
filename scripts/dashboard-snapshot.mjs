#!/usr/bin/env node
/**
 * Nimmt einen STRUKTUR-Abzug der Block-Stapel-Seiten und schreibt ihn als JSON.
 *
 * Wozu: Etappe C stellt die Seiten auf ein Block-Register um, und das Prüfkriterium lautet „der
 * Bildschirm sieht danach exakt gleich aus". Ein Pixel-Vergleich taugt dafür NICHT — auf dem
 * Dashboard tickt ein Countdown im Sekundentakt, ein Screenshot-Diff wäre nie null und damit
 * wertlos. Verglichen wird deshalb, was sich beim Umbau ändern KÖNNTE: die Reihenfolge der Blöcke
 * und ihr Textinhalt.
 *
 * Alle Ziffern werden zu `#` normalisiert. Das nimmt dem Abzug die tickende Uhr und die zwischen
 * zwei Läufen weiterlaufenden Tragestunden — und lässt genau das stehen, worum es geht:
 * WELCHE Blöcke in WELCHER Reihenfolge mit WELCHEN Beschriftungen erscheinen.
 *
 * Usage:
 *   node scripts/dashboard-snapshot.mjs <user> <passwort> <datei.json> [port]
 *
 * Voraussetzung: laufender Dev-Server mit geseedeten Daten.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const [, , username, password, outFile, portArg] = process.argv;
if (!username || !password || !outFile) {
  console.error("Usage: node scripts/dashboard-snapshot.mjs <user> <passwort> <datei.json> [port]");
  process.exit(1);
}
const BASE = `http://localhost:${portArg ?? 3000}`;

/**
 * Die Seiten mit Block-Stapel und der Selektor ihres Stapel-Containers.
 *
 * Der Selektor steht ausdrücklich da, statt geraten zu werden: ein „nimm den ersten flex-column
 * mit Abstand"-Heuristik griff auf der Statistik-Seite in eine Ziel-Karte hinein und meldete vier
 * Zielbalken als vier Blöcke — falsch, und zwar unauffällig falsch.
 */
const PAGES = [
  { path: "/dashboard", stack: "div.flex.flex-col.gap-4" },
  { path: "/dashboard/stats", stack: "main.flex.flex-col" },
];

/**
 * Jede Ziffern-FOLGE zu einem `#`: nimmt Uhr und Laufzeit heraus, lässt Struktur und Wörter stehen.
 *
 * Folge, nicht Einzelziffer — sonst leckt die Stellenzahl durch, und zwei Läufe im Abstand von
 * Minuten melden eine Abweichung, wo nur die Uhr weitergegangen ist (`#T #min` gegen `#T ##min`).
 */
const stripDigits = (s) => s.replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

async function login(page) {
  // Wie in take-screenshots.mjs: der clientseitige signIn wirft im Next-16-Dev-Server
  // sporadisch "Invalid URL"; der Callback direkt ist verlässlich und teilt sich den Cookie-Jar.
  const { csrfToken } = await (await page.request.get(`${BASE}/api/auth/csrf`)).json();
  const res = await page.request.post(`${BASE}/api/auth/callback/credentials`, {
    form: { csrfToken, username, password, callbackUrl: `${BASE}/dashboard` },
    headers: { "content-type": "application/x-www-form-urlencoded" },
    // Der Callback antwortet mit 302 auf NEXTAUTH_URL. Der Umleitung zu folgen bringt nichts und
    // scheitert, sobald der Dev-Server auf einem anderen Port läuft als NEXTAUTH_URL nennt.
    maxRedirects: 0,
  });
  if (!res.ok() && res.status() !== 302) throw new Error(`Login fehlgeschlagen: ${res.status()}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await context.newPage();
await login(page);

const snapshot = {};
for (const { path, stack } of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const blocks = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { error: `Stapel-Container nicht gefunden: ${sel}` };
    return [...root.children].map((el, i) => ({
      index: i,
      tag: el.tagName.toLowerCase(),
      text: el.innerText || "",
    }));
  }, stack);
  if (blocks.error) throw new Error(`${path}: ${blocks.error}`);
  snapshot[path] = blocks.map((b) => ({ ...b, text: stripDigits(b.text) }));
}

await browser.close();
fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2) + "\n");
for (const [path, blocks] of Object.entries(snapshot)) {
  console.log(`${path}: ${Array.isArray(blocks) ? blocks.length + " Blöcke" : JSON.stringify(blocks)}`);
}
