// Spiegelt einen dunklen Entwurfs-Bildschirm in die helle Fassung.
//
//   node docs/design/spiegeln.mjs traeger   vorschau/statistik.html     vorschau/statistik-hell.html
//   node docs/design/spiegeln.mjs keyholder vorschau/keyholder-sub.html vorschau/keyholder-sub-hell.html
//
// Die Tabellen unten SIND die Entscheidung — jede Zeile steht in hell.md begründet. Wer einen
// Bildschirm von Hand überträgt, trifft sie ein zweites Mal und anders.
//
// Zwei Dinge, die hier NICHT stehen, weil sie sich selbst regeln:
//   - Tönungen behalten ihre Farbe. rgba(255,61,104,α) ist auf Schwarz ein dunkles Weinrot und auf
//     Weiss ein blasses Rosa — beide Male „eine Rose-Tönung". Eine Fläche bleibt eine Fläche.
//   - Die Marken-Rose #ff3d68 bleibt #ff3d68, solange sie Marke ist (Punkt, Icon, Logo): 3,2:1
//     liegt über der 3:1-Schranke für Grafik. Wo sie Intensität kodiert oder Text trägt, greifen
//     die Verbund-Regeln weiter unten.

import fs from 'fs'

// ── Verbund-Regeln ───────────────────────────────────────────────────────────
// Laufen ZUERST. Sie treffen Paare, die einzeln nicht entscheidbar sind: dieselbe Farbe ist an
// einer Stelle eine Marke und an der nächsten eine Füllung, die Intensität bedeutet.
const VERBUND = [
  // Der gefüllte Knopf. Dunkel: dunkle Schrift auf voller Rose. Hell: WEISSE Schrift auf der
  // Tinte — weiss auf #ff3d68 wären 3,4:1 und fielen bei 14 px durch.
  ['color: #2b0410; background: #ff3d68', 'color: #ffffff; background: #c3002b'],
  ['#2b0410', '#ffffff'],                       // das Icon im selben Knopf

  // Kalenderzellen: die Ziffer richtet sich nach IHRER Zelle, nicht nach dem Grund. Dunkel wird
  // die Ziffer heller, je voller die Zelle — und kippt auf der Spitze auf dunkel. Hell läuft es
  // genau andersherum und kippt oben auf weiss.
  ['background: #120b0e; color: #9a868e',            'background: #fbf2f4; color: #7d656d'],  // leer     4,8:1
  ['background: #1a1013; color: #9a868e',            'background: #faecef; color: #7d656d'],  // 0        4,6:1
  ['background: #4a1226; color: #c9b7bd',            'background: #f3cfd7; color: #634d55'],  // <25      5,4:1
  ['background: #7a1836; color: #fdf7f8',            'background: #e8a2b2; color: #2d1d26'],  // 25–40    7,8:1
  ['background: #a11f45; color: rgba(255,255,255,0.75)', 'background: #df7b91; color: #3d0518'], // 40–65 6,0:1
  ['background: #ff3d68; color: #3d0518',            'background: #c3022d; color: #ffffff'],  // >65      6,2:1

  // Leiser Text auf einer getönten Auflage verliert hell seinen Puffer: #8c8ea6 steht auf dem
  // Grund mit 5,0:1, auf dem Chip nur noch mit 4,4:1. Dort gilt die mittlere Stufe.
  ['class="act" style="color: #8c8ea6;"', 'class="act" style="color: #4d5363;"'],
  ['class="act" style="color: #9a868e;"', 'class="act" style="color: #634d55;"'],

  // Balkenfüllungen kodieren Intensität und nehmen die Rampe — die Spitze ist die Tinte, nicht
  // die Marken-Rose. Sonst stünde ein 87-%-Balken heller da als ein 40-%-Balken.
  ['height: 100%; background: #ff3d68', 'height: 100%; background: #c3022d'],
  ['height: 100%; background: #a11f45', 'height: 100%; background: #df7b91'],
  ['height: 100%; background: #7a1836', 'height: 100%; background: #e8a2b2'],
]

// ── Bedeutungsfarben ─────────────────────────────────────────────────────────
// Als TINTE, sobald sie Text sind oder eine Marke unter 2 px.
const GEMEINSAM = [
  ['#ff5c7a', '#c3002b'],   // Rosa, heller Textton
  ['#ff8ba0', '#a00023'],   // Rosa, Hover
  ['#e8b44a', '#7f5a10'],   // Gold → Bronze. Der offene Entscheid: hell.md, „Gold-Fall"
  ['#ff8a5c', '#b23200'],   // Koralle
]

// ── Weisse Auflagen → dunkle ─────────────────────────────────────────────────
// Nicht geschätzt: für jedes Alpha ist gemessen, welchen Kontrastschritt es im Dunkeln macht,
// und das helle Alpha gesucht, das denselben Schritt macht. Auf Hell braucht es etwas mehr.
// Beide Seiten als Zeichenkette: die Quelle schreibt "0.10", und String(0.10) wäre "0.1" —
// die Ersetzung träfe nicht und der Wert rutschte still durch.
const AUFLAGEN = [
  ['0.020', '0.01'], ['0.04', '0.04'], ['0.055', '0.05'], ['0.06', '0.05'], ['0.07', '0.07'],
  ['0.08', '0.08'], ['0.09', '0.10'], ['0.10', '0.11'], ['0.11', '0.13'], ['0.12', '0.14'],
  ['0.14', '0.17'], ['0.16', '0.20'], ['0.20', '0.27'], ['0.30', '0.43'],
]
const auflagen = (tinte) =>
  AUFLAGEN.map(([weiss, dunkel]) => [`rgba(255,255,255,${weiss})`, `rgba(${tinte},${dunkel})`])

const TRAEGER = [
  // Grund und Flächen
  ['#0b0609', '#fcf7f8'],   // Grund
  ['#140d10', '#f6eef1'],   // Erhöht
  ['#241a1e', '#f0e5e9'],   // Feld
  ['#120b0e', '#fbf2f4'],   // die leere Kalenderzelle, falls sie einzeln auftritt
  // Text
  ['#fdf7f8', '#2d1d26'],   // hoch
  ['#c9b7bd', '#634d55'],   // mitte
  ['#9a868e', '#7d656d'],   // leise
  ['#7d6b73', '#7d656d'],   // Grafik-Striche; als TEXT gibt es diese Stufe nicht mehr
  // Intensitäts-Rampe, soweit sie einzeln steht
  ['#a11f45', '#df7b91'], ['#7a1836', '#e8a2b2'], ['#4a1226', '#f3cfd7'], ['#1a1013', '#faecef'],
  ...auflagen('45,29,38'),
  // Schein → Tönung: ein heller Grund kann nicht strahlen, nur sich einfärben. Etwa ein Drittel
  // des dunklen Alphas; der Ausklang geht auf den hellen Grund statt auf den dunklen.
  ['rgba(11,6,9,0)', 'rgba(252,247,248,0)'],
  ['rgba(150,20,55,0.50)', 'rgba(255,61,104,0.17)'],
  ['rgba(150,20,55,0.32)', 'rgba(255,61,104,0.11)'],
  ['rgba(150,20,55,0.30)', 'rgba(255,61,104,0.10)'],
  ['rgba(90,12,38,0.24)',  'rgba(255,61,104,0.06)'],
  ['rgba(190,70,25,0.30)', 'rgba(255,138,92,0.11)'],
  ['rgba(190,70,25,0.26)', 'rgba(255,138,92,0.09)'],
  ['rgba(120,45,15,0.13)', 'rgba(255,138,92,0.05)'],
]

const KEYHOLDER = [
  ['#070810', '#f7f8fc'],   // Grund
  ['#f4f5fb', '#1d2130'],   // Text hoch
  ['#bcbed3', '#4d5363'],   // Text mitte
  ['#8c8ea6', '#646b7b'],   // Text leise
  ['#a9a3ff', '#4e45e8'],   // Rollen-Tinte
  ['#a11f45', '#dd7c94'], ['#7a1836', '#e5a3b5'], ['#4a1226', '#efd0da'], ['#1a1013', '#f5edf3'],
  ...auflagen('29,33,48'),
  ['rgba(7,8,16,0)', 'rgba(247,248,252,0)'],
  ['rgba(99,91,235,0.24)', 'rgba(78,69,232,0.13)'],
  ['rgba(129,120,255,0.55)', 'rgba(78,69,232,0.30)'],
  ['rgba(88,78,214,0.32)', 'rgba(78,69,232,0.11)'],
  ['rgba(88,78,214,0.30)', 'rgba(78,69,232,0.11)'],
]

// Was die Tabellen bewusst NICHT anfassen: die Flächen behalten ihren vollen Ton, und die
// Schrift, die auf so einer Fläche steht, bleibt dieselbe.
const BEHALTEN = new Set([
  '#ff3d68', '#e8b44a', '#ff8a5c',            // die drei Bedeutungsfarben als FLÄCHE
  '#3d0518', '#3d2a05', '#451605',            // Schrift AUF einer Fläche
  '#ffffff', '#000000',
  '#e9e4e6',                                  // die Bühne, die dieses Skript selbst einsetzt
])

const [rolle, quelle, ziel] = process.argv.slice(2)
if (!rolle || !quelle || !ziel) {
  console.error('Aufruf: node docs/design/spiegeln.mjs <traeger|keyholder> <quelle.html> <ziel.html>')
  console.error('Hinweis: die beiden warmen Keyholder-Varianten stehen auf dem TRÄGER-Grund.')
  process.exit(1)
}
const tabelle = rolle === 'traeger' ? TRAEGER : rolle === 'keyholder' ? KEYHOLDER : null
if (!tabelle) { console.error(`Unbekannte Rolle: ${rolle}`); process.exit(1) }
if (!fs.existsSync(quelle)) { console.error(`Quelle nicht gefunden: ${quelle}`); process.exit(1) }

// Die Ersetzungen laufen der Reihe nach über denselben Text. Erzeugt eine frühe Zeile etwas, das
// eine spätere als Suchmuster hat, wird es ein zweites Mal ersetzt — und zwar lautlos und mit einem
// Ergebnis, das niemand entschieden hat. Das prüft die Tabelle an sich selbst, bevor sie läuft.
{
  const reihe = [...VERBUND, ...tabelle, ...GEMEINSAM]
  for (let i = 0; i < reihe.length; i++)
    for (let j = i + 1; j < reihe.length; j++)
      if (reihe[i][1].includes(reihe[j][0])) {
        console.error(`Tabellen-Konflikt: Zeile ${i + 1} erzeugt "${reihe[i][1]}",`)
        console.error(`Zeile ${j + 1} ersetzt darin "${reihe[j][0]}" gleich wieder.`)
        process.exit(1)
      }
}

let s = fs.readFileSync(quelle, 'utf8')
for (const [dunkel, hell] of [...VERBUND, ...tabelle, ...GEMEINSAM]) s = s.split(dunkel).join(hell)
if (!s.includes('background:#000;')) console.warn('  ! keine Bühnen-Regel gefunden — Rand bleibt schwarz')
s = s.replace('background:#000;', 'background:#e9e4e6;')
s = s.replace(/<title>([^<]+)<\/title>/, '<title>$1-hell</title>')

// Die Tabellen decken nicht jeden Bildschirm ab. Was sie nicht kennen, bliebe unverändert stehen
// — und das Ergebnis sähe plausibel aus. Also abbrechen statt raten.
//
// Geprüft wird NICHT „ist noch etwas dunkel?", sondern „hat die Tabelle diesen Wert überhaupt
// angefasst?". Der Unterschied ist nicht theoretisch: `#f7f0f2` war heller Text auf dunklem Grund,
// überlebte die Dunkel-Prüfung mühelos und stand danach mit 1,06:1 unsichtbar auf Weiss.
const erzeugt = new Set([...VERBUND, ...tabelle, ...GEMEINSAM]
  .flatMap(([, hell]) => [...hell.matchAll(/#[0-9a-f]{6}\b/gi)].map(m => m[0].toLowerCase())))
const offen = new Set()
for (const [hex] of s.matchAll(/#[0-9a-f]{6}\b/gi)) {
  const h = hex.toLowerCase()
  if (!BEHALTEN.has(h) && !erzeugt.has(h)) offen.add(h)
}
for (const [rgba] of s.matchAll(/rgba\(255,\s*255,\s*255,[^)]*\)/g)) offen.add(rgba)

if (offen.size) {
  console.error(`\n${quelle}: ${offen.size} Werte ohne Zuordnung — NICHT geschrieben.\n`)
  console.error('  ' + [...offen].join('\n  '))
  console.error(`\nJeder davon braucht eine Zeile in ${tabelle === TRAEGER ? 'TRAEGER' : 'KEYHOLDER'},`)
  console.error('GEMEINSAM oder — wenn er nur im Paar entscheidbar ist — in VERBUND.')
  process.exit(1)
}

fs.writeFileSync(ziel, s)
console.log(`${quelle} → ${ziel} (${rolle})`)
