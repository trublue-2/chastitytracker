// Spiegelt einen dunklen Entwurfs-Bildschirm in die helle Fassung.
//
//   node docs/design/spiegeln.mjs traeger   vorschau/statistik.html      vorschau/statistik-hell.html
//   node docs/design/spiegeln.mjs keyholder vorschau/keyholder-sub.html  vorschau/keyholder-sub-hell.html
//
// Die Tabellen unten SIND die Entscheidung — jede Zeile steht in hell.md begründet. Wer die sechs
// noch fehlenden Bildschirme von Hand überträgt, trifft sie ein zweites Mal und anders.
//
// Danach IMMER nachsehen (beides von Hand, beides in hell.md erklärt):
//   1. Balken- und Kalender-Füllungen, die Intensität kodieren, nehmen die Rampe — Spitze #c3022d,
//      nicht die Marken-Rose #ff3d68. Diese Datei kann Füllung und Marke nicht auseinanderhalten.
//   2. Leiser Text auf einer getönten Auflage verliert hell seinen Puffer und muss auf die
//      mittlere Stufe. Auf dem Grund stimmt er.
// Prüfen am gerenderten Bild, nicht am Token: Kontrast-Abzug über jeden Textknoten mit der
// tatsächlich aufgeschichteten Hintergrundfarbe (getComputedStyle), nicht der deklarierten.

import fs from 'fs'

const GEMEINSAM = [
  // Bedeutungsfarben werden zu TINTE, sobald sie Text oder eine dünne Marke sind.
  ['#ff5c7a', '#c3002b'],  // Rosa, heller Textton
  ['#ff8ba0', '#a00023'],  // Rosa, Hover
  ['#e8b44a', '#7f5a10'],  // Gold → Bronze. Der offene Entscheid: siehe hell.md, „Gold-Fall"
  ['#ff8a5c', '#b23200'],  // Koralle
]

const TRAEGER = [
  ['#0b0609', '#fcf7f8'],  // Grund
  ['#241a1e', '#f0e5e9'],  // Feld
  ['#fdf7f8', '#2d1d26'],  // Text hoch
  ['#c9b7bd', '#634d55'],  // Text mitte
  ['#9a868e', '#7d656d'],  // Text leise
  ['#7d6b73', '#7d656d'],  // die vierte Stufe des dunklen Entwurfs (4,04:1) fällt hier weg
  ['#a11f45', '#df7b91'],  // Rampe 40–65 %
  ['#7a1836', '#e8a2b2'],  // Rampe 25–40 %
  ['rgba(255,255,255,0.07)', 'rgba(45,29,38,0.10)'],
  ['rgba(255,255,255,0.08)', 'rgba(45,29,38,0.11)'],
  ['rgba(255,255,255,0.06)', 'rgba(45,29,38,0.06)'],
  ['rgba(255,255,255,0.10)', 'rgba(45,29,38,0.12)'],
  ['rgba(255,255,255,0.20)', 'rgba(45,29,38,0.26)'],
  ['rgba(255,61,104,0.13)', 'rgba(255,61,104,0.16)'],
  ['rgba(255,61,104,0.18)', 'rgba(255,61,104,0.16)'],
  // Schein → Tönung: ein heller Grund kann nicht strahlen, nur sich einfärben
  ['rgba(150,20,55,0.50) 0%, rgba(90,12,38,0.24) 34%, rgba(11,6,9,0) 68%',
   'rgba(255,61,104,0.17) 0%, rgba(255,61,104,0.06) 34%, rgba(252,247,248,0) 68%'],
]

const KEYHOLDER = [
  ['#070810', '#f7f8fc'],  // Grund
  ['#f4f5fb', '#1d2130'],  // Text hoch
  ['#bcbed3', '#4d5363'],  // Text mitte
  ['#8c8ea6', '#646b7b'],  // Text leise
  ['#a9a3ff', '#4e45e8'],  // Rollen-Tinte
  ['rgba(255,255,255,0.07)', 'rgba(29,33,48,0.09)'],
  ['rgba(255,255,255,0.06)', 'rgba(29,33,48,0.06)'],
  ['rgba(99,91,235,0.24)', 'rgba(78,69,232,0.13)'],
  ['rgba(255,138,92,0.09)', 'rgba(178,50,0,0.10)'],
  ['rgba(88,78,214,0.30) 0%, rgba(7,8,16,0) 66%',
   'rgba(78,69,232,0.11) 0%, rgba(247,248,252,0) 66%'],
]

const [rolle, quelle, ziel] = process.argv.slice(2)
if (!rolle || !quelle || !ziel) {
  console.error('Aufruf: node docs/design/spiegeln.mjs <traeger|keyholder> <quelle.html> <ziel.html>')
  process.exit(1)
}
const tabelle = rolle === 'traeger' ? TRAEGER : rolle === 'keyholder' ? KEYHOLDER : null
if (!tabelle) { console.error(`Unbekannte Rolle: ${rolle}`); process.exit(1) }

// Was nach der Ersetzung noch dunkel im Blatt stehen DARF: Text, Tinten, Schrift auf einer Fläche.
const ERLAUBT_DUNKEL = new Set([
  '#2d1d26', '#634d55', '#7d656d',            // Textstufen Träger
  '#1d2130', '#4d5363', '#646b7b',            // Textstufen Keyholder
  '#c3002b', '#c3022d', '#a00023',            // Rosa: Tinte, Rampen-Spitze, Hover
  '#7f5a10', '#b23200', '#4e45e8',            // Gold-, Koralle-, Rollen-Tinte
  '#3d0518', '#3d2a05', '#451605',            // Schrift AUF einer Fläche
])
const luminanz = (hex) => {
  const k = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b)
}

let s = fs.readFileSync(quelle, 'utf8')
for (const [dunkel, hell] of [...tabelle, ...GEMEINSAM]) s = s.split(dunkel).join(hell)
// Die Bühne um das Artboard herum: schwarz → hellgrau
if (!s.includes('background:#000;')) console.warn('  ! keine Bühnen-Regel gefunden — Rand bleibt schwarz')
s = s.replace('background:#000;', 'background:#e9e4e6;')
s = s.replace(/<title>([^<]+)<\/title>/, '<title>$1-hell</title>')

// Die Tabellen decken heute die zwei gebauten Bildschirme ab, nicht alle. Was sie nicht kennen,
// bliebe sonst DUNKEL auf einem hellen Grund stehen — und das Ergebnis sähe plausibel aus. Also
// abbrechen statt raten: jeder übrig gebliebene dunkle Wert ist eine Entscheidung, die noch fehlt.
const offen = new Set()
for (const [hex] of s.matchAll(/#[0-9a-f]{6}\b/gi))
  if (!ERLAUBT_DUNKEL.has(hex.toLowerCase()) && luminanz(hex.toLowerCase()) < 0.20) offen.add(hex)
for (const [rgba] of s.matchAll(/rgba\(255,\s*255,\s*255,[^)]*\)/g)) offen.add(rgba)

if (offen.size) {
  console.error(`\n${quelle}: ${offen.size} Werte ohne Zuordnung — NICHT geschrieben.\n`)
  console.error('  ' + [...offen].join('\n  '))
  console.error(`\nJeder davon braucht eine Zeile in ${tabelle === TRAEGER ? 'TRAEGER' : 'KEYHOLDER'} oder GEMEINSAM.`)
  console.error('Weisse Auflagen (rgba(255,255,255,…)) hellen einen dunklen Grund auf und haben auf')
  console.error('einem hellen nichts zu suchen — sie werden zu dunklen Auflagen, nicht weggelassen.')
  process.exit(1)
}

fs.writeFileSync(ziel, s)
console.log(`${quelle} → ${ziel} (${rolle}). Jetzt die zwei Nacharbeiten oben prüfen.`)
