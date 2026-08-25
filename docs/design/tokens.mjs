import fs from 'node:fs'

// Erzeugt die vier Theme-Blöcke von globals.css aus EINER Beschreibung.
//
//   node docs/design/tokens.mjs            # gibt die Blöcke aus
//   node docs/design/tokens.mjs --write    # schreibt sie in src/app/globals.css
//
// Warum generiert und nicht von Hand gepflegt: vier Themes × rund 130 Tokens sind 520 Werte, die
// von Hand konsistent zu halten sind. Genau daran ist es schon einmal gescheitert — die dunkle
// Kategorie-Palette stand nur in einem der beiden dunklen Themes, und der Träger-Dunkelmodus zeigte
// deshalb helle Chips. Was aus einer Quelle kommt, kann nicht halb gepflegt werden.
//
// Die HERLEITUNG steht in docs/design/README.md (dunkel) und hell.md (hell). Hier stehen nur die
// Entscheidungen als Daten.

// ── Die drei Bedeutungen ─────────────────────────────────────────────────────
// Mehr gibt es nicht. Alles andere ist neutral — das ist der Kern des Entwurfs.
// Der Identitäts-Farbton ist umschaltbar, damit man ihn AM ECHTEN BILDSCHIRM vergleichen kann
// statt an einer Beschreibung.
//
// Beide Welten stehen im Blatt: `--write` schreibt den rosa Bestand in die vier Theme-Blöcke und
// die grünen ABWEICHUNGEN in einen eigenen Abschnitt unter `[data-ident="gruen"]`. Umgeschaltet
// wird dann am Gerät, nicht im Generator — nur so vergleicht man zwei Fassungen desselben
// Bildschirms, ohne zwischen zwei Bauten zu wechseln und dabei zu vergessen, wie die erste aussah.
let IDENTITAET = process.env.IDENTITAET === 'gruen' ? 'gruen' : 'rosa'

const ZUSTAND = {
  // Die Rose des Entwurfs.
  // `rampe` ist die Spitze des Tragekalenders auf HELL. Sie steht getrennt, weil die Rampe eine
  // Fläche einfärbt statt Text zu tragen und deshalb gesättigter sein darf als der Textton.
  rosa:  { dunkel: '#ff3d68', hell: '#c3002b', flaeche: '#ff3d68', rampe: '#c3022d' },
  // Das Grün der bisherigen App, auf dasselbe Kontrast-Profil gebracht.
  gruen: { dunkel: '#34d399', hell: '#067a45', flaeche: '#34d399', rampe: '#067a45' },
}

const BEDEUTUNG = {
  rosa:    ZUSTAND[IDENTITAET],                                         // der Zustand
  gold:    { dunkel: '#e8b44a', hell: '#7f5a10', flaeche: '#e8b44a' },  // die Auszeichnung
  koralle: { dunkel: '#ff8a5c', hell: '#b23200', flaeche: '#ff8a5c' },  // die Aufmerksamkeit
}

// ── Welche der acht Bestandsfamilien auf welche Bedeutung fällt ──────────────
// Die Token-NAMEN bleiben, damit keine Komponente angefasst werden muss. Was sich ändert, ist
// wohin sie zeigen. Mehrere Familien auf derselben Bedeutung heisst: der Unterschied war keiner.
const FAMILIE = {
  lock:      'rosa',      // verschlossen — der Zustand schlechthin
  sperrzeit: 'rosa',      // auch ein Verschluss-Zustand, nur angeordnet
  inspect:   'koralle',   // eine Kontrolle will etwas von dir
  request:   'koralle',   // eine Anforderung ebenso
  warn:      'koralle',   // zu spät, Vergehen — dieselbe Aufforderung, dringlicher
  ok:        'gold',      // geschafft
  unlock:    'neutral',   // die Abwesenheit eines Zustands ist kein Signal
  orgasm:    'neutral',   // eine Eintragsart, kein Zustand und keine Aufforderung
}

// ── Die vier Fassungen ───────────────────────────────────────────────────────
// Die Rolle sitzt im GRUND, nicht im Akzent: man erkennt den Bereich an der Temperatur des Raums,
// den Sachverhalt an der Farbe des Signals.
// ── Die Rolle ────────────────────────────────────────────────────────────────
// Der Bereich, in dem man steht, muss OHNE Vergleich erkennbar sein — man sieht die beiden nie
// nebeneinander. Ein warmer gegen einen kühlen Grund misst ΔE 2,9; das erkennt man nur, wenn
// beide gleichzeitig auf dem Schirm liegen (so lag es auf dem Entwurfsblatt). Im Betrieb ist es
// kein Signal.
//
// Der Entwurf verwarf den Akzent mit der Begründung, „verschlossen" hiesse dann beim Träger rosa
// und beim Keyholder indigo. Das traf nicht zu: die Bedeutungsfarben waren in beiden Rollen schon
// immer identisch (`--color-lock` war in beiden `#0d9151`). Die Rolle sass nur in der UMGEBUNG —
// Kopfzeile, Navigation, Hauptknopf. Das ist der Unterschied, um den es geht, und er bleibt.
//
// Also beides: die Temperatur des Grunds UND ein Umgebungs-Akzent je Rolle.
const ROLLE = {
  traeger:   ZUSTAND[IDENTITAET],                       // derselbe Ton wie der Zustand
  keyholder: { dunkel: '#8f88ff', hell: '#4e45e8' },   // Indigo — im Entwurf der Schein des
                                                        // Keyholder-Bildschirms
}

/** Schaltet den Identitäts-Ton für alle folgenden Aufrufe um.
 *
 *  Die beiden Tabellen sind Objekte, keine Bindungen — deshalb genügt es, ihre eine identitäts-
 *  abhängige Zeile neu zu setzen, statt jede Ableitung zu parametrisieren. Alles andere im
 *  Generator bleibt unberührt und kann von der Umschaltung nichts mitbekommen. */
export function setIdentitaet(ident) {
  IDENTITAET = ident === 'gruen' ? 'gruen' : 'rosa'
  BEDEUTUNG.rosa = ZUSTAND[IDENTITAET]
  ROLLE.traeger = ZUSTAND[IDENTITAET]
  Object.assign(THEMES['user'], TRAEGER_GRUND[IDENTITAET].hell)
  Object.assign(THEMES['user-dark'], TRAEGER_GRUND[IDENTITAET].dunkel)
}

// Der GRUND des Träger-Bereichs hängt am Identitäts-Ton, nicht nur der Akzent.
//
// Die Temperatur des Raums ist auf die Rose gestimmt: ein warmer, ins Rötliche gezogener Grund.
// Steht darauf ein grüner Akzent, ist es nicht die grüne Welt, sondern die rosa Welt mit grünen
// Knöpfen — und der Unterschied fällt genau dort auf, wo die Fläche gross ist (Kopfzeile,
// Navigation). Der Keyholder-Bereich bleibt unberührt: dessen Indigo steht nicht zur Wahl.
const TRAEGER_GRUND = {
  rosa:  {
    hell:   { grund: '#fcf7f8', erhoeht: '#f6eef1', feld: '#f0e5e9', text: ['#2d1d26', '#634d55', '#7d656d'], tinte: '45,29,38' },
    dunkel: { grund: '#0b0609', erhoeht: '#140d10', feld: '#241a1e', text: ['#fdf7f8', '#c9b7bd', '#9a868e'], tinte: '255,255,255' },
  },
  gruen: {
    hell:   { grund: '#f7faf8', erhoeht: '#eef4f0', feld: '#e5ede8', text: ['#1d2a23', '#4d5c54', '#65736b'], tinte: '29,42,35' },
    dunkel: { grund: '#060907', erhoeht: '#0e130f', feld: '#1a211c', text: ['#f5fbf7', '#b7c6bd', '#869388'], tinte: '255,255,255' },
  },
}

const THEMES = {
  'user':        { hell: true,  rolle: 'traeger',   ...TRAEGER_GRUND.rosa.hell },
  'user-dark':   { hell: false, rolle: 'traeger',   ...TRAEGER_GRUND.rosa.dunkel },
  'admin-light': { hell: true,  rolle: 'keyholder', grund: '#f7f8fc', erhoeht: '#eef1f8', feld: '#e5eaf3',
                   text: ['#1d2130', '#4d5363', '#646b7b'], tinte: '29,33,48' },
  'admin':       { hell: false, rolle: 'keyholder', grund: '#070810', erhoeht: '#0f1119', feld: '#181b26',
                   text: ['#f4f5fb', '#bcbed3', '#8c8ea6'], tinte: '255,255,255' },
}

// ── Farbrechnen ──────────────────────────────────────────────────────────────
const px = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) }
const hex = (...v) => '#' + v.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')
const mix = (a, b, t) => { const A = px(a), B = px(b); return hex(...A.map((v, i) => v + (B[i] - v) * t)) }
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = (h) => { const [r, g, b] = px(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) }
const kontrast = (a, b) => { const x = lum(a), y = lum(b); const [h, l] = x > y ? [x, y] : [y, x]; return (h + 0.05) / (l + 0.05) }
/** Mischung Grund→Ton, die einen Ziel-Kontrast zum Grund trifft. */
const beiKontrast = (grund, ton, ziel) => {
  let best = ton, d = Infinity
  for (let t = 0; t <= 1.0001; t += 0.002) {
    const c = mix(grund, ton, t), dd = Math.abs(kontrast(c, grund) - ziel)
    if (dd < d) { d = dd; best = c }
  }
  return best
}

// Kontrast-Profil, gemessen am Bestand: eine Fläche ist eine Ahnung (1,06), ein Rahmen eine
// Andeutung (2,5 dunkel / 1,3 hell), Text darauf trägt.
const PROFIL = { bg: { dunkel: 1.06, hell: 1.05 }, border: { dunkel: 2.5, hell: 1.32 } }

function familieTokens(name, bedeutung, th) {
  const art = th.hell ? 'hell' : 'dunkel'
  const ton = bedeutung === 'neutral' ? th.text[1] : BEDEUTUNG[bedeutung][art]
  const flaeche = bedeutung === 'neutral' ? th.text[2] : BEDEUTUNG[bedeutung].flaeche
  const bg = beiKontrast(th.grund, flaeche, PROFIL.bg[art])
  const border = beiKontrast(th.grund, flaeche, PROFIL.border[art])
  // Der Text steht AUF der Fläche, nicht auf dem Grund. Er rückt deshalb zur Vordergrundfarbe hin
  // — hell wird er dunkler, dunkel heller. Fiele er mit `--color-X` zusammen, hätte die Familie
  // zwei Namen für einen Wert und die Fläche verlöre ihren Kontrast.
  const text = mix(ton, th.text[0], 0.35)
  return [
    [`--color-${name}`, ton], [`--color-${name}-bg`, bg], [`--color-${name}-border`, border],
    [`--color-${name}-muted`, text], [`--color-${name}-text`, text],
  ]
}

export function themeTokens(themeName) {
  const th = THEMES[themeName]
  const art = th.hell ? 'hell' : 'dunkel'
  const rollenton = ROLLE[th.rolle][art]
  const out = []
  const setze = (k, v) => out.push([`--${k}`, v])
  setze('background', th.grund); setze('background-subtle', mix(th.grund, th.erhoeht, 0.5))
  setze('surface', th.erhoeht); setze('surface-raised', th.feld)
  setze('surface-overlay', th.grund + (th.hell ? 'e6' : 'e6'))
  setze('border', mix(th.grund, th.text[2], 0.28))
  setze('border-subtle', mix(th.grund, th.text[2], 0.14))
  setze('border-strong', mix(th.grund, th.text[2], 0.5))
  // Die Textstufen sind gegen die UNGÜNSTIGSTE Fläche kalibriert, nicht gegen den Grund.
  //
  // Gegen den Grund gemessen erreichte die leise Stufe 5,0:1 — und fiel auf `surface-raised`
  // trotzdem auf 4,32:1 durch, weil jede erhöhte Fläche vom Grund wegrückt. Das ist kein
  // Einzelfall, sondern eine ganze Klasse: neun Stellen auf einem einzigen Bildschirm. Wer sie
  // einzeln flickt, flickt sie auf dem nächsten Bildschirm wieder.
  //
  // `feld` ist in beiden Richtungen die entfernteste Fläche — hell die dunkelste, dunkel die
  // hellste. Wer dort trägt, trägt überall.
  const stufe = (ton, ziel, auf = th.feld) => {
    let c = ton
    for (let t = 0; t <= 0.6; t += 0.01) {
      c = mix(ton, th.text[0], t)
      if (kontrast(c, auf) >= ziel) break
    }
    return c
  }
  setze('foreground', th.text[0])
  setze('foreground-muted', stufe(th.text[1], 7))
  setze('foreground-faint', stufe(th.text[2], 4.5))
  setze('foreground-invert', th.hell ? '#ffffff' : '#2b0410')
  for (const [fam, bed] of Object.entries(FAMILIE)) out.push(...familieTokens(fam, bed, th))

  // Die Intensitäts-Rampe des Tragekalenders. Sie lief bisher in BLAU — im Farbsystem bedeutet
  // Blau `unlock`, also ausgerechnet das Gegenteil von "viel getragen". Jetzt eine Helligkeits-
  // rampe derselben Rosa-Familie, auf dasselbe Kontrast-Profil wie dunkel/hell gespiegelt.
  const rampeZiele = [1.08, 1.35, 1.93, 2.68, th.hell ? 5.88 : 5.86]
  const spitze = th.hell ? BEDEUTUNG.rosa.rampe : BEDEUTUNG.rosa.flaeche
  rampeZiele.forEach((ziel, i) => setze(`wear-${i}`, beiKontrast(th.grund, spitze, ziel)))
  // Die Ziffer richtet sich nach IHRER Zelle, nicht nach dem Grund (siehe hell.md).
  const aufZelle = (zelle) => {
    for (const kandidat of th.hell ? [th.text[2], th.text[1], th.text[0], '#3d0518', '#ffffff']
                                   : [th.text[2], th.text[1], th.text[0], '#3d0518'])
      if (kontrast(kandidat, zelle) >= 4.5) return kandidat
    return th.hell ? '#ffffff' : '#3d0518'
  }
  rampeZiele.forEach((ziel, i) => setze(`wear-${i}-text`, aufZelle(beiKontrast(th.grund, spitze, ziel))))

  // ── Kopfzeile und Navigation: hier sitzt die ROLLE ─────────────────────────
  //
  // Der Entwurf wollte die Rolle allein in der Temperatur des Grunds haben und den Akzent
  // freihalten. Begründung dort: sonst hiesse „verschlossen" beim Träger rosa und beim Keyholder
  // indigo — dieselbe Tatsache in zwei Farben.
  //
  // Der Einwand traf nicht zu. Die Bedeutungsfarben waren in beiden Rollen schon immer identisch
  // (`--color-lock` war in beiden `#0d9151`); die Rolle sass nur in der UMGEBUNG. Und der Grund
  // allein trägt sie nicht: warm gegen kühl misst ΔE 2,9, und das erkennt man nur, wenn beide
  // Bereiche gleichzeitig auf dem Schirm liegen. Genau so lagen sie auf dem Entwurfsblatt — im
  // Betrieb sieht man immer nur einen.
  //
  // Also beides: die Temperatur des Grunds UND ein Umgebungs-Akzent. Die Anteile sind gemessen,
  // nicht gegriffen — bei diesen Werten liegt der Unterschied bei ΔE ≈ 10, der Schwelle für „ohne
  // Vergleich erkennbar", und die Fläche bleibt mit 1,17 zum Grund eine Tönung statt eines Balkens.
  const akzent = BEDEUTUNG.rosa[art]
  const rollig = (anteil) => mix(th.grund, rollenton, anteil * (th.hell ? 1 : 0.68))
  setze('header-bg', rollig(0.09))
  setze('header-border', rollig(0.20))
  setze('header-text', th.text[0])
  setze('header-avatar-bg', rollig(0.26))
  // Die Schrift steht auf der getönten Kachel, nicht auf dem Grund — der Rollenton selbst hätte
  // dort zu wenig. Die hohe Textstufe trägt in beiden Fassungen.
  setze('header-avatar-text', th.text[0])
  setze('nav-bg', rollig(0.09))
  setze('nav-border', rollig(0.20))
  setze('nav-active-bg', rollig(0.16)); setze('nav-active-text', th.text[0])
  // Gegen die NAVIGATIONSFLÄCHE kalibriert, nicht gegen den Grund. Seit die Navigation die Rolle
  // trägt, ist sie getönt — und die leise Stufe, die auf dem Grund 5,0:1 schafft, fiel dort auf
  // 4,41:1 durch. Sieben Beschriftungen auf einmal, in genau einer der vier Fassungen. Das ist
  // dieselbe Falle wie bei den erhöhten Flächen: eine Stufe gilt nur für den Untergrund, gegen den
  // sie gemessen wurde.
  // Gegen die AKTIVE Navigationsfläche kalibriert — die ist die dunkelste der drei, die dort
  // vorkommen (Leiste, aktiver Eintrag, Symbol-Kachel). Gegen die Leiste allein gemessen kam
  // 4,55:1 heraus und die Beschriftung fiel trotzdem mit 4,41:1 durch, weil sie stellenweise auf
  // der aktiven Fläche sitzt. Wer auf der ungünstigsten trägt, trägt auf allen.
  setze('nav-inactive-text', stufe(th.text[2], 4.5, rollig(0.16)))
  setze('nav-inactive-hover', th.text[0])
  setze('nav-icon-bg', th.feld); setze('nav-icon-active-bg', akzent)
  setze('focus-ring', rollenton)

  // ── Knöpfe ────────────────────────────────────────────────────────────────
  // "Genau ein gefüllter Knopf je Bildschirm" — der gefüllte trägt Rosa. Auf HELL nimmt er die
  // TINTE, nicht die Marken-Rose: weiss auf #ff3d68 sind 3,4:1 und fallen bei 14 px durch.
  setze('btn-primary-bg', akzent)
  setze('btn-primary-hover', mix(akzent, th.hell ? '#000000' : '#ffffff', 0.18))
  setze('btn-primary-text', th.hell ? '#ffffff' : '#2b0410')
  // Die acht Aktions-Knopffarben folgen derselben Zusammenlegung wie die Familien.
  for (const [fam, bed] of Object.entries(FAMILIE))
    setze(`btn-${fam}`, bed === 'neutral' ? th.text[1] : BEDEUTUNG[bed][art])

  // ── Die eine grosse Fläche ────────────────────────────────────────────────
  // Die Kopfzeile der laufenden Session. Sie trug `bg-gradient-to-br from-emerald-600
  // to-emerald-500` — hartkodiert, von keinem Theme erreichbar, und über den halben Bildschirm
  // gesättigt.
  //
  // Sie ist jetzt eine TÖNUNG, kein Farbblock. Zwei Gründe, und der zweite wiegt schwerer:
  //
  //  1. Der Entwurf erlaubt je Bildschirm EIN grosses farbiges Element. Ein Verlauf über die
  //     halbe Höhe ist keins, er ist der Bildschirm.
  //  2. Auf gesättigter Rose ist Schrift-Hierarchie nicht mehr darstellbar. Volle Deckkraft
  //     schafft 4,96:1, jede Abstufung darunter fällt durch — gemessen 3,48:1 für die
  //     Beschriftung, 3,79:1 für den Wert. Man kann auf so einer Fläche EINE Lautstärke haben,
  //     die App braucht dort drei.
  //
  // Den Zustand trägt jetzt die Schrift (Rosa-Tinte) statt der Fläche. Genau so meint es der
  // Entwurf: „Man erkennt den Sachverhalt an der Farbe des Signals", nicht an der Grundfläche.
  setze('color-lock-grad-a', th.erhoeht)
  setze('color-lock-grad-b', beiKontrast(th.grund, BEDEUTUNG.rosa.flaeche, th.hell ? 1.22 : 1.45))
  setze('color-lock-on', th.text[0])
  setze('color-lock-on-muted', th.text[1])
  // Die Tönung hinter der grossen Zahl. Sie ersetzt das Leuchten, das ein heller Grund nicht
  // kann — und sie ist der einzige Ort je Bildschirm, an dem etwas strahlen darf.
  {
    const [r, g, b] = px(rollenton)
    setze('hero-glow', `rgba(${r},${g},${b},${th.hell ? 0.13 : 0.20})`)
  }
  // Der Vollbild-Bildbetrachter bleibt schwarz — ein Foto beurteilt man nicht auf Farbe. Als
  // Token, damit die Stelle auffindbar ist und nicht als `#000` im Style-Objekt versteckt liegt.
  setze('lightbox-bg', '#000000')

  // ── Schatten ──────────────────────────────────────────────────────────────
  // "Leuchten gibt es nur an der runden Taste." Flächen tragen deshalb keinen Schlagschatten mehr,
  // sondern trennen sich durch Haarlinien und Raum. Was bleibt, hebt nur noch Überlagerungen ab.
  setze('shadow-card', 'none')
  setze('shadow-raised', th.hell ? '0 1px 2px 0 rgb(0 0 0 / 0.06)' : '0 1px 2px 0 rgb(0 0 0 / 0.5)')
  setze('shadow-overlay', th.hell
    ? '0 16px 32px -8px rgb(0 0 0 / 0.18)'
    : '0 16px 32px -8px rgb(0 0 0 / 0.7)')
  return out
}

// ── Ins Blatt schreiben ──────────────────────────────────────────────────────
// Von Hand einsetzen war die stille Fehlerquelle: der Generator lief, die Werte sahen im Terminal
// richtig aus, und im Blatt stand weiter der alte Stand. Deshalb schreibt er selbst — und prüft
// hinterher nach, dass jeder Block wirklich getroffen wurde. Eine Ersetzung, die ins Leere läuft,
// muss abbrechen, nicht schweigen.

const zeile = ([k, v]) => `  ${(k + ':').padEnd(26)}${v};`

/** Die Tokens eines Themes in der gewünschten Identität. */
function tokensIn(ident, name) {
  setIdentitaet(ident)
  return themeTokens(name)
}

/** Nur die Tokens, in denen sich Grün von Rosa unterscheidet. */
function gruenAbweichung(name) {
  const rosa = new Map(tokensIn('rosa', name))
  return tokensIn('gruen', name).filter(([k, v]) => rosa.get(k) !== v)
}

/** Die Selektoren, unter denen die grüne Abweichung gilt.
 *
 *  Zwei, weil `data-theme` an ZWEI Stellen hängt: an `<html>` (für alles, was per Portal am Body
 *  klebt) und am Bereichs-Wrapper. `data-ident` sitzt nur an `<html>` — die Abweichung muss also
 *  beide Träger erreichen, den einen als Kombination, den anderen als Nachfahren.
 *
 *  KEIN `:root[data-ident="gruen"]` für das helle Träger-Theme, obwohl es ohne Attribut gilt: das
 *  Inline-Skript setzt `data-theme` und `data-ident` in derselben Anweisung, ein Wurzelelement mit
 *  Ton und ohne Theme gibt es also nicht. Der Selektor hätte nur die Spezifität (0,2,0) in den
 *  Ring geworfen und damit von der Reihenfolge der Blöcke abhängig gemacht, welche Welt eine
 *  Keyholder-Seite bekommt. */
function identSelektoren(name) {
  return [`[data-ident="gruen"][data-theme="${name}"]`, `[data-ident="gruen"] [data-theme="${name}"]`]
}

const MARKE_AUF = '/* ══ ERZEUGT von docs/design/tokens.mjs — der grüne Identitäts-Ton ══'
const MARKE_ZU = '/* ══ Ende des erzeugten Bereichs ══ */'

function gruenAbschnitt() {
  const teile = [
    MARKE_AUF,
    '   Nur die Tokens, die sich vom rosa Bestand unterscheiden — der Rest erbt aus den vier',
    '   Theme-Blöcken oben. Umgeschaltet wird am Gerät (Einstellungen → Farbwelt); so liegen beide',
    '   Fassungen desselben Bildschirms nebeneinander statt in zwei Bauten.',
    '   ═════════════════════════════════════════════════════════════════════════════════════ */',
  ]
  for (const name of Object.keys(THEMES)) {
    teile.push('', identSelektoren(name).join(',\n') + ' {')
    for (const t of gruenAbweichung(name)) teile.push(zeile(t))
    teile.push('}')
  }
  teile.push('', MARKE_ZU)
  return teile.join('\n')
}

/** Schneidet den erzeugten grünen Abschnitt heraus: `[vor der Marke, nach der Endmarke]`.
 *  Fehlt er, ist der Rumpf das ganze Blatt und der Schwanz leer. */
function trenneGruenAb(css) {
  const auf = css.indexOf(MARKE_AUF)
  if (auf < 0) return [css, '']
  const zu = css.indexOf(MARKE_ZU, auf)
  if (zu < 0) throw new Error('Anfangsmarke ohne Endmarke — von Hand nachsehen')
  return [css.slice(0, auf).replace(/\s*$/, '\n'), css.slice(zu + MARKE_ZU.length)]
}

/** Ersetzt den Rumpf eines Theme-Blocks im Blatt. Bricht ab, wenn der Block nicht eindeutig ist. */
function ersetzeBlock(css, name, tokens) {
  const kopf = `[data-theme="${name}"] {`
  // Der Kopf allein ist nicht eindeutig: `[data-theme="user-dark"] {` steht auch als zweite Zeile
  // des dunklen Kategorie-Blocks. Zwei Schranken zusammen machen ihn es: er muss am ZEILENANFANG
  // stehen (sonst trifft er die Kombinations-Selektoren `[data-ident="…"][data-theme="…"]`), und
  // der Block dahinter muss den Grund definieren.
  const treffer = [...css.matchAll(new RegExp('^' + kopf.replace(/[[\]{}]/g, '\\$&'), 'gm'))]
    .filter((m) => css.slice(m.index, css.indexOf('\n}', m.index)).includes('--background:'))
  if (treffer.length !== 1) throw new Error(`${name}: ${treffer.length} Blockköpfe gefunden, genau einer erwartet`)
  const start = treffer[0].index + kopf.length
  const ende = css.indexOf('\n}', start)
  if (ende < 0) throw new Error(`${name}: kein Blockende gefunden`)
  return css.slice(0, start) + '\n' + tokens.map(zeile).join('\n') + css.slice(ende)
}

function schreibe(pfad) {
  let css = fs.readFileSync(pfad, 'utf8')

  // ZUERST den erzeugten Abschnitt herausnehmen, DANN die Theme-Blöcke ersetzen.
  //
  // Andersherum lief es genau einmal: der grüne Abschnitt trägt für `user` den Kopf
  // `[data-ident="gruen"][data-theme="user"] {` — darin steckt die Zeichenkette
  // `[data-theme="user"] {`. Seit der Grund identitätsabhängig ist, steht in diesem Block auch
  // `--background:`, und damit fand der Filter unten ZWEI Blöcke statt einem und brach ab. Das
  // Blatt liess sich danach nicht mehr neu erzeugen. Wer nichts sucht, was er gerade selbst
  // geschrieben hat, kann sich auch nicht daran verschlucken.
  const [rumpf, schwanz] = trenneGruenAb(css)
  css = rumpf
  for (const name of Object.keys(THEMES)) css = ersetzeBlock(css, name, tokensIn('rosa', name))
  css = css.replace(/\s*$/, '\n') + '\n\n' + gruenAbschnitt() + schwanz

  fs.writeFileSync(pfad, css)
  return css
}

if (process.argv[1]?.endsWith('tokens.mjs')) {
  if (process.argv.includes('--write')) {
    const pfad = new URL('../../src/app/globals.css', import.meta.url).pathname
    schreibe(pfad)
    const zahlen = Object.keys(THEMES).map((n) => `${n}: ${gruenAbweichung(n).length}`)
    console.log(`globals.css geschrieben — vier Theme-Blöcke, grüne Abweichungen (${zahlen.join(', ')})`)
  } else {
    for (const name of Object.keys(THEMES)) {
      console.log(`\n[data-theme="${name}"] {`)
      for (const [k, v] of tokensIn(IDENTITAET, name)) console.log(zeile([k, v]))
      console.log('}')
    }
  }
}
