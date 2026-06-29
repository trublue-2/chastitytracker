/**
 * Erzeugt geschmackvolle, NICHT explizite Demo-Bilder (flache Vektor-Illustrationen)
 * für die im Tracker angezeigten Fotos (Geräte, Referenzfotos, Kontroll-/Verschluss-Fotos).
 * Statt schwarzer Platzhalter. Rastert SVG -> PNG via sharp.
 *
 * Ausführung:  node scripts/gen-demo-assets.mjs
 * Output:      scripts/demo-assets/<name>.png  (800x800)
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "demo-assets");
fs.mkdirSync(OUT, { recursive: true });

const S = 800;

// Weicher Hintergrund (Studio-Look) in wählbarem Farbton.
function bg(c1, c2) {
  return `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
      </linearGradient>
      <radialGradient id="vig" cx="0.5" cy="0.42" r="0.7">
        <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.16"/>
      </radialGradient>
      <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#d9e0e8"/><stop offset="0.5" stop-color="#9aa7b5"/><stop offset="1" stop-color="#6c7886"/>
      </linearGradient>
      <linearGradient id="steel2" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#aeb9c6"/><stop offset="1" stop-color="#7c8896"/>
      </linearGradient>
      <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e7c879"/><stop offset="1" stop-color="#b8923f"/>
      </linearGradient>
      <linearGradient id="silicone" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#7c6f9c"/><stop offset="1" stop-color="#4b4168"/>
      </linearGradient>
    </defs>
    <rect width="${S}" height="${S}" fill="url(#bg)"/>
    <ellipse cx="400" cy="650" rx="250" ry="40" fill="#000" opacity="0.10"/>
    <rect width="${S}" height="${S}" fill="url(#vig)"/>`;
}

function wrap(inner, c1 = "#eef2f7", c2 = "#d4dde7") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${bg(c1, c2)}${inner}</svg>`;
}

// ── Keuschheitskäfig (abstrakt, iconografisch) ──────────────────────────────
function cage() {
  return `
    <g transform="translate(400,360)">
      <!-- Basisring -->
      <ellipse cx="0" cy="150" rx="120" ry="46" fill="none" stroke="url(#steel)" stroke-width="34"/>
      <!-- Käfig-Tube: konische Röhre aus Ringen -->
      <g fill="none" stroke="url(#steel2)" stroke-width="26" stroke-linecap="round">
        <path d="M -96 120 Q 0 150 96 120"/>
        <path d="M -86 60 Q 0 86 86 60"/>
        <path d="M -74 0 Q 0 22 74 0"/>
        <path d="M -60 -60 Q 0 -42 60 -60"/>
      </g>
      <!-- Längsstreben -->
      <g fill="none" stroke="url(#steel)" stroke-width="22" stroke-linecap="round">
        <path d="M -96 122 Q -78 20 -52 -80"/>
        <path d="M 96 122 Q 78 20 52 -80"/>
        <path d="M 0 150 L 0 -92"/>
      </g>
      <!-- abgerundete Spitze -->
      <path d="M -52 -80 Q 0 -150 52 -80" fill="none" stroke="url(#steel)" stroke-width="24" stroke-linecap="round"/>
      <!-- Vorhängeschloss am Basisring -->
      <g transform="translate(0,205)">
        <path d="M -22 -6 a 22 22 0 0 1 44 0" fill="none" stroke="#8c97a4" stroke-width="12"/>
        <rect x="-30" y="-6" width="60" height="52" rx="10" fill="url(#brass)"/>
        <circle cx="0" cy="18" r="6" fill="#7a5f23"/>
      </g>
    </g>`;
}

// ── Plug (teardrop + Basis) ─────────────────────────────────────────────────
function plug() {
  return `
    <g transform="translate(400,330)">
      <path d="M 0 -150 C 95 -150 120 -10 95 70 C 78 130 30 150 0 150 C -30 150 -78 130 -95 70 C -120 -10 -95 -150 0 -150 Z"
            fill="url(#silicone)"/>
      <ellipse cx="-30" cy="-70" rx="26" ry="60" fill="#ffffff" opacity="0.12"/>
      <!-- Hals + Basisring -->
      <rect x="-26" y="150" width="52" height="36" fill="url(#silicone)"/>
      <ellipse cx="0" cy="205" rx="120" ry="40" fill="none" stroke="url(#silicone)" stroke-width="40"/>
    </g>`;
}

// ── Kontroll-/Verschluss-Foto: Käfig mit handgeschriebenem Code-Zettel ───────
function sealCode(code = "47829") {
  return `
    ${cage()}
    <g transform="translate(545,470) rotate(8)">
      <rect x="-70" y="-44" width="160" height="92" rx="8" fill="#fcfaf2" stroke="#d8cfa6" stroke-width="3"/>
      <text x="10" y="2" font-family="'Comic Sans MS','Segoe Script',cursive" font-size="46"
            fill="#1f3a8a" text-anchor="middle" font-weight="700">${code}</text>
      <text x="10" y="32" font-family="sans-serif" font-size="15" fill="#9a9374" text-anchor="middle">Kontroll-Code</text>
    </g>`;
}

const assets = [
  { name: "demo-cage", svg: wrap(cage(), "#eef2f7", "#d2dbe6") },
  { name: "demo-cage-ref1", svg: wrap(cage(), "#f1eef7", "#dcd6ea") },
  { name: "demo-cage-ref2", svg: wrap(cage(), "#e9f1ee", "#cfe0d8") },
  { name: "demo-cage-ref3", svg: wrap(cage(), "#f3eee9", "#e3d6c8") },
  { name: "demo-plug", svg: wrap(plug(), "#efedf5", "#d8d2e6") },
  { name: "demo-seal-code", svg: wrap(sealCode(), "#eef2f7", "#d2dbe6") },
];

for (const a of assets) {
  const file = path.join(OUT, `${a.name}.png`);
  await sharp(Buffer.from(a.svg)).png().toFile(file);
  console.log("✓", a.name, `(${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}
console.log("\nFertig:", OUT);
