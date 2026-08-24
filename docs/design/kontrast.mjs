// Kontrast-Abzug über die Entwurfs-Blätter in vorschau/.
//
//   node docs/design/kontrast.mjs                    # alle Blätter
//   node docs/design/kontrast.mjs statistik-hell     # nur dieses
//
// Warum am gerenderten Ergebnis und nicht an der Token-Tabelle: die Befunde dieser Etappe hingen
// ALLE daran. Am Token gerechnet war jede einzelne Farbe korrekt — durchgefallen sind Paarungen,
// die erst beim Aufeinanderschichten entstehen (leiser Text auf einer getönten Auflage) oder die
// niemand in der Tabelle stehen hatte (eine vierte, undokumentierte Textstufe).
//
// Gemessen wird gegen den AUFGESCHICHTETEN Grund: jede durchscheinende Auflage der Elternkette
// wird übereinandergelegt, nicht nur die nächstliegende deklarierte Farbe.
//
// Inaktive Bedienelemente bleiben aussen vor: WCAG 1.4.3 nimmt sie ausdrücklich aus, und ein
// gesperrter Knopf MUSS matt aussehen — er soll ja sagen, dass hier nichts zu holen ist. Sie
// müssen dafür als inaktiv ausgezeichnet sein (`disabled` / `aria-disabled`), nicht bloss blass.
//
// Verläufe bleiben aussen vor — genau wie im Browser, wo getComputedStyle nur backgroundColor
// liefert. Der Schein hinter der grossen Zahl zählt also nicht mit; er ist an der hellsten Stelle
// eine Tönung, die den Kontrast anhebt, nicht senkt.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const VOID = new Set(['meta', 'link', 'br', 'img', 'input', 'hr', 'source', 'use'])
const VERERBT = ['color', 'font-size', 'font-weight']

const dekl = (txt) => {
  const o = {}
  for (const teil of txt.split(';')) {
    const i = teil.indexOf(':')
    if (i < 0) continue
    o[teil.slice(0, i).trim().toLowerCase()] = teil.slice(i + 1).trim()
  }
  return o
}

function klassenRegeln(html) {
  const regeln = {}
  for (const [, block] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g))
    for (const [, sel, body] of block.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      for (const s of sel.split(',').map(x => x.trim()))
        if (s.startsWith('.')) regeln[s.slice(1)] = { ...(regeln[s.slice(1)] || {}), ...dekl(body) }
  return regeln
}

const zahl = (s) => { const m = /(-?[\d.]+)/.exec(s || ''); return m ? parseFloat(m[1]) : null }
const farbe = (s) => {
  if (!s) return null
  const h = /#([0-9a-f]{6})\b/i.exec(s)
  if (h) return [[0, 2, 4].map(i => parseInt(h[1].slice(i, i + 2), 16)), 1]
  const r = /rgba?\(([^)]+)\)/i.exec(s)
  if (r) {
    const p = r[1].split(',').map(x => parseFloat(x.trim()))
    return [[p[0], p[1], p[2]], p.length > 3 ? p[3] : 1]
  }
  return null
}
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const kontrast = (a, b) => { const x = lum(a), y = lum(b); const [h, l] = x > y ? [x, y] : [y, x]; return (h + 0.05) / (l + 0.05) }
const drueber = (f, a, u) => f.map((v, i) => v * a + u[i] * (1 - a))
const hx = (a) => '#' + a.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')

function pruefe(datei) {
  const html = fs.readFileSync(datei, 'utf8')
  const regeln = klassenRegeln(html)
  const befunde = []
  let schwaechste = { wert: Infinity }

  // Stapel aus geerbten Eigenschaften und aufgeschichteten Hintergründen
  const stapel = [{ erbe: { color: '#000000', 'font-size': '16px', 'font-weight': '400' }, grund: [[255, 255, 255]], inaktiv: false }]
  const tags = /<\/?([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g
  let pos = 0, m

  while ((m = tags.exec(html))) {
    const text = html.slice(pos, m.index).replace(/\s+/g, ' ').trim()
    pos = tags.lastIndex
    const oben = stapel[stapel.length - 1]

    if (text && !/^<!--/.test(text) && !oben.inaktiv) {
      const fg = farbe(oben.erbe.color)
      const px = zahl(oben.erbe['font-size']) ?? 16
      const gew = zahl(oben.erbe['font-weight']) ?? 400
      if (fg) {
        const bg = oben.grund[oben.grund.length - 1]
        const soll = (px >= 24 || (px >= 18.66 && gew >= 700)) ? 3 : 4.5
        const ist = kontrast(fg[0], bg)
        if (ist < schwaechste.wert) schwaechste = { wert: ist, text: text.slice(0, 26), fg: hx(fg[0]), bg: hx(bg), px }
        if (ist < soll) befunde.push({ text: text.slice(0, 30), fg: hx(fg[0]), auf: hx(bg), px, ist: +ist.toFixed(2), soll })
      }
    }

    const [, tag, attrs, selbstSchliessend] = m
    const name = tag.toLowerCase()
    if (m[0][1] === '/') { if (stapel.length > 1) stapel.pop(); continue }
    if (selbstSchliessend || VOID.has(name)) continue
    if (name === 'style' || name === 'script') {
      // Hinter das Schluss-Tag springen, nicht davor: sonst zählt das folgende </style> als
      // Schliessung und nimmt die ELTERN-Ebene vom Stapel, die nie geöffnet wurde.
      const schluss = `</${name}>`
      const ende = html.indexOf(schluss, pos)
      if (ende >= 0) { pos = ende + schluss.length; tags.lastIndex = pos }
      continue
    }

    const kl = /class\s*=\s*"([^"]*)"/.exec(attrs)
    const st = /style\s*=\s*"([^"]*)"/.exec(attrs)
    let props = {}
    if (kl) for (const c of kl[1].split(/\s+/)) if (regeln[c]) props = { ...props, ...regeln[c] }
    if (st) props = { ...props, ...dekl(st[1]) }

    const erbe = { ...oben.erbe }
    for (const p of VERERBT) if (props[p]) erbe[p] = props[p]

    const grund = [...oben.grund]
    const bg = props['background-color'] || props['background']
    const c = bg && !/gradient/i.test(bg) ? farbe(bg) : null
    if (c && c[1] > 0) grund.push(drueber(c[0], c[1], grund[grund.length - 1]))

    const inaktiv = oben.inaktiv || /\bdisabled\b|aria-disabled\s*=\s*"true"/.test(attrs)
    stapel.push({ erbe, grund, inaktiv })
  }
  return { datei: path.basename(datei), befunde, schwaechste }
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vorschau')
const filter = process.argv[2]
const dateien = fs.readdirSync(dir).filter(f => f.endsWith('.html') && (!filter || f.includes(filter))).sort()

let gesamt = 0
for (const f of dateien) {
  const r = pruefe(path.join(dir, f))
  gesamt += r.befunde.length
  const s = r.schwaechste
  const zeile = `${r.datei.padEnd(36)} ${String(r.befunde.length).padStart(2)} durchgefallen   schwächste ${s.wert.toFixed(2)}:1`
  console.log(r.befunde.length ? `✗ ${zeile}` : `  ${zeile}`)
  for (const b of r.befunde)
    console.log(`      „${b.text}" ${b.fg} auf ${b.auf} @${b.px}px = ${b.ist}:1 (soll ${b.soll})`)
}
console.log(`\n${dateien.length} Blätter, ${gesamt} Durchfaller.`)
process.exit(gesamt ? 1 : 0)
