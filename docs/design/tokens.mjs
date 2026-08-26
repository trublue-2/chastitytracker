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
// Die Farbwelt ist umschaltbar, damit man sie AM ECHTEN BILDSCHIRM vergleichen kann statt an
// einer Beschreibung. Alle Welten stehen gleichzeitig im Blatt: `--write` schreibt die Vorgabe in
// die vier Theme-Blöcke und jede weitere als ABWEICHUNG in einen eigenen Abschnitt unter
// `[data-ident="…"]`. Umgeschaltet wird am Gerät, nicht im Generator — nur so vergleicht man
// Fassungen desselben Bildschirms, ohne zwischen Bauten zu wechseln und dabei zu vergessen, wie
// die vorige aussah.

// ── Die drei Welten ──────────────────────────────────────────────────────────
// Eine Welt legt vier Dinge fest: welchen Ton der ZUSTAND trägt („verschlossen"), welchen Ton die
// beiden ROLLEN in ihrer Umgebung tragen (Kopfzeile, Navigation, Hauptknopf), und wie warm oder
// kühl der GRUND der beiden Bereiche steht.
//
// `rosa` und `gruen` sind zwei Fassungen derselben Idee: EIN Identitäts-Ton für die ganze App,
// der Keyholder-Bereich als Gegenpol in Indigo. `geteilt` ist die andere Idee — die Rolle SELBST
// wird die Farbe: Grün beim Träger, Rot bei der Keyholderin.
//
// Der Zustand kann in `geteilt` nicht mehr der Identitäts-Ton sein, denn es gibt zwei davon. Er
// wird Grün, und zwar in BEIDEN Bereichen: „verschlossen" ist dieselbe Tatsache, egal wer
// hinsieht — das war schon immer so und ist der Grund, warum die Bedeutungsfarben nie an der
// Rolle hingen. Rot bliebe damit der Keyholderin allein, als Umgebung.
const WELTEN = {
  rosa:    { zustand: 'rosa',  rolle: { traeger: 'rosa',  keyholder: 'indigo' }, grund: { traeger: 'rosa',  keyholder: 'kuehl' } },
  gruen:   { zustand: 'gruen', rolle: { traeger: 'gruen', keyholder: 'indigo' }, grund: { traeger: 'gruen', keyholder: 'kuehl' } },
  geteilt: { zustand: 'gruen', rolle: { traeger: 'gruen', keyholder: 'rosa'   }, grund: { traeger: 'gruen', keyholder: 'warm'  } },
}

/** Die Welt, die in den vier Theme-Blöcken selbst steht. Alle anderen kommen als Abweichung
 *  darunter — siehe `weltenAbschnitt()`. */
const WELT_VORGABE = 'rosa'

// `Object.hasOwn`, nicht `WELTEN[x]`: `IDENTITAET=constructor` wäre sonst truthy und liefe erst
// später auf einen Absturz in `grundVon`.
let IDENTITAET = Object.hasOwn(WELTEN, process.env.IDENTITAET ?? '') ? process.env.IDENTITAET : WELT_VORGABE

const ZUSTAND = {
  // Die Rose des Entwurfs.
  // `rampe` ist die Spitze des Tragekalenders auf HELL. Sie steht getrennt, weil die Rampe eine
  // Fläche einfärbt statt Text zu tragen und deshalb gesättigter sein darf als der Textton.
  rosa:  { dunkel: '#ff3d68', hell: '#c3002b', flaeche: '#ff3d68', rampe: '#c3022d' },
  // Das Grün der bisherigen App, auf dasselbe Kontrast-Profil gebracht.
  gruen: { dunkel: '#34d399', hell: '#067a45', flaeche: '#34d399', rampe: '#067a45' },
}

/** Alle Töne, die eine Welt vergeben kann — die Zustands-Töne plus Indigo.
 *
 *  EINE Tabelle, damit `WELTEN[…].zustand` und `WELTEN[…].rolle.*` denselben Schlüsselraum
 *  benutzen. Vorher wählte ein `name === 'indigo'` zwischen zwei Tabellen, und ein vierter
 *  Rollen-Ton hätte entweder ein zweites `if` gebraucht oder wäre versehentlich auch als
 *  ZUSTANDS-Ton wählbar geworden. Indigo hat keine `rampe`: es färbt nie den Tragekalender,
 *  weil das eine Angabe über den Träger ist. */
const TOENE = {
  ...ZUSTAND,
  indigo: { dunkel: '#8f88ff', hell: '#4e45e8' },  // im Entwurf der Schein des Keyholder-Bildschirms
}

const BEDEUTUNG = {
  rosa:    TOENE[WELTEN[IDENTITAET].zustand],                           // der Zustand
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
  traeger:   TOENE[WELTEN[IDENTITAET].rolle.traeger],
  keyholder: TOENE[WELTEN[IDENTITAET].rolle.keyholder],
}

/** Schaltet den Identitäts-Ton für alle folgenden Aufrufe um.
 *
 *  Die beiden Tabellen sind Objekte, keine Bindungen — deshalb genügt es, ihre eine identitäts-
 *  abhängige Zeile neu zu setzen, statt jede Ableitung zu parametrisieren. Alles andere im
 *  Generator bleibt unberührt und kann von der Umschaltung nichts mitbekommen. */
export function setIdentitaet(ident) {
  IDENTITAET = Object.hasOwn(WELTEN, ident ?? '') ? ident : WELT_VORGABE
  const w = WELTEN[IDENTITAET]
  BEDEUTUNG.rosa = TOENE[w.zustand]
  ROLLE.traeger = TOENE[w.rolle.traeger]
  ROLLE.keyholder = TOENE[w.rolle.keyholder]
  for (const th of Object.values(THEMES)) Object.assign(th, grundVon(th.rolle, th.hell))
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

/** Der Grund des KEYHOLDER-Bereichs. `kuehl` gehört zu Indigo; `warm` zu einem roten Rollen-Ton —
 *  ein kühl-blauer Raum unter einer roten Kopfzeile liest sich als zwei Entwürfe übereinander. */
const KEYHOLDER_GRUND = {
  kuehl: {
    hell:   { grund: '#f7f8fc', erhoeht: '#eef1f8', feld: '#e5eaf3', text: ['#1d2130', '#4d5363', '#646b7b'], tinte: '29,33,48' },
    dunkel: { grund: '#070810', erhoeht: '#0f1119', feld: '#181b26', text: ['#f4f5fb', '#bcbed3', '#8c8ea6'], tinte: '255,255,255' },
  },
  warm: {
    hell:   { grund: '#fcf8f8', erhoeht: '#f6eff0', feld: '#f0e6e7', text: ['#2b1d1f', '#614d50', '#7b6568'], tinte: '43,29,31' },
    dunkel: { grund: '#0b0708', erhoeht: '#140e0f', feld: '#241b1c', text: ['#fdf8f8', '#c9b9ba', '#9a888a'], tinte: '255,255,255' },
  },
}

const grundVon = (rolle, hell) => (rolle === 'traeger' ? TRAEGER_GRUND : KEYHOLDER_GRUND)
  [WELTEN[IDENTITAET].grund[rolle]][hell ? 'hell' : 'dunkel']

const THEMES = {
  'user':        { hell: true,  rolle: 'traeger',   ...TRAEGER_GRUND.rosa.hell },
  'user-dark':   { hell: false, rolle: 'traeger',   ...TRAEGER_GRUND.rosa.dunkel },
  'admin-light': { hell: true,  rolle: 'keyholder', ...KEYHOLDER_GRUND.kuehl.hell },
  'admin':       { hell: false, rolle: 'keyholder', ...KEYHOLDER_GRUND.kuehl.dunkel },
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
  const stufe = (ton, ziel) => {
    let c = ton
    for (let t = 0; t <= 0.6; t += 0.01) {
      c = mix(ton, th.text[0], t)
      if (ALLE_FLAECHEN.every((f) => kontrast(c, f) >= ziel)) break
    }
    return c
  }
  // Die Flächen, gegen die die leisen Textstufen kalibriert werden.
  //
  // Genau hier ist die Falle dieser Datei schon dreimal zugeschnappt: eine Textstufe gilt nur für
  // den Untergrund, gegen den sie gemessen wurde. Erst fiel die leise Stufe auf `surface-raised`
  // durch, dann auf der aktiven Navigationsfläche, dann auf der Kopfzeile — jedes Mal einzeln
  // geflickt, jedes Mal in genau einer der vier Fassungen.
  //
  // Die Menge listet die Flächen, die diese Tokens WIRKLICH TRAGEN, nicht alle getönten. Der
  // Unterschied ist nicht akademisch: die Avatar-Kachel (`rollig(0.26)`) ist die dunkelste von
  // allen und wäre damit immer die bindende — sie trägt aber ausschliesslich `--header-avatar-text`
  // (die volle Vordergrundfarbe). Gegen sie zu kalibrieren hob die leise Stufe so weit an, dass der
  // Abstand zwischen PRIMÄR und SEKUNDÄR auf 1,32 zusammenfiel. Eine Stufe, die auf einer Fläche
  // trägt, auf der sie nie steht, bezahlt das mit der Hierarchie überall sonst.
  const rollig = (anteil) => mix(th.grund, rollenton, anteil * (th.hell ? 1 : 0.68))
  // Die Glut hinter der grossen Zahl in ihrem Maximum — ein `rgba` über dem Grund, also derselbe
  // Wert wie eine Mischung. Sie gehört dazu, weil die laufende Session ihre Nebenzeilen genau
  // darauf setzt (`LaufendeSessionCard`, `text-foreground-muted`/`-faint`); ohne sie fiel die
  // leise Stufe im dunklen Träger-Theme der grünen Welten auf 4,41:1 durch. Getrennt von `rollig`,
  // weil das Leuchten seine eigene Leiter hat und nicht die Rollen-Tönung ist.
  const glutAnteil = th.hell ? 0.13 : 0.20
  const glut = mix(th.grund, rollenton, glutAnteil)
  const ALLE_FLAECHEN = [th.feld, rollig(0.09), rollig(0.16), glut]

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
  // Der Akzent ist der ROLLEN-Ton, nicht der Zustands-Ton.
  //
  // In den Ein-Ton-Welten sind das für den Träger dieselbe Farbe, und der Unterschied fiel deshalb
  // nie auf — der Hauptknopf der Keyholderin trug dort dennoch schon die falsche Herkunft. In
  // `geteilt` treten die beiden auseinander, und dann ist es sichtbar falsch: ihr Hauptknopf
  // stünde grün in einem roten Raum. „Die Rolle sitzt in der Umgebung — Kopfzeile, Navigation,
  // Hauptknopf" (umsetzung.md); der Knopf gehört also zur Rolle, nicht zum Zustand.
  const akzent = rollenton
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
  // Dieselbe Stufe wie `--foreground-faint`: die Navigationsfläche steht in `ALLE_FLAECHEN`, die
  // Rechnung ist also schon gemacht. Der Token bleibt trotzdem eigen — die Navigation ist die eine
  // Fläche, deren Tönung sich mit der Rolle ändert, und wer sie später anders stimmen will, findet
  // hier die Stelle statt sie aus `foreground-faint` herausschälen zu müssen.
  setze('nav-inactive-text', stufe(th.text[2], 4.5))
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
    setze('hero-glow', `rgba(${r},${g},${b},${glutAnteil})`)
  }
  // Dasselbe Leuchten in der Aufmerksamkeitsfarbe — für den Helden, hinter dem eine FRIST läuft
  // (die Reinigungspause). Es braucht einen eigenen Token und nicht `color-warn-bg`: das ist eine
  // deckende Fläche, und ein deckender Kern in einem `transparent`-Verlauf übermalt den Grund,
  // statt ihn zu tönen — ein Fleck statt eines Leuchtens. Derselbe Glut-Anteil, damit beide Helden
  // gleich hell strahlen.
  {
    const [r, g, b] = px(th.hell ? BEDEUTUNG.koralle.hell : BEDEUTUNG.koralle.dunkel)
    setze('hero-glow-warn', `rgba(${r},${g},${b},${glutAnteil})`)
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

/** Die Welten, die als Abweichung ins Blatt kommen — alle ausser der Vorgabe. */
const NEBENWELTEN = Object.keys(WELTEN).filter((w) => w !== WELT_VORGABE)

/** Nur die Tokens, in denen sich `welt` von der Vorgabe unterscheidet. */
function abweichung(welt, name) {
  const basis = new Map(tokensIn(WELT_VORGABE, name))
  return tokensIn(welt, name).filter(([k, v]) => basis.get(k) !== v)
}

/** Die Selektoren, unter denen die grüne Abweichung gilt.
 *
 *  Zwei, weil `data-theme` an ZWEI Stellen hängt: an `<html>` (für alles, was per Portal am Body
 *  klebt) und am Bereichs-Wrapper. `data-ident` sitzt nur an `<html>` — die Abweichung muss also
 *  beide Träger erreichen, den einen als Kombination, den anderen als Nachfahren.
 *
 *  KEIN `:root[data-ident="…"]` für das helle Träger-Theme, obwohl es ohne Attribut gilt: das
 *  Inline-Skript setzt `data-theme` und `data-ident` in derselben Anweisung, ein Wurzelelement mit
 *  Ton und ohne Theme gibt es also nicht. Der Selektor hätte nur die Spezifität (0,2,0) in den
 *  Ring geworfen und damit von der Reihenfolge der Blöcke abhängig gemacht, welche Welt eine
 *  Keyholder-Seite bekommt. */
function identSelektoren(welt, name) {
  const sel = [`[data-ident="${welt}"][data-theme="${name}"]`, `[data-ident="${welt}"] [data-theme="${name}"]`]
  // Das helle Träger-Theme gilt auch OHNE `data-theme` — es ist `:root`. Diesen Fall gibt es
  // wirklich: Anmeldung, Passwort-Reset und Info liegen ausserhalb beider Bereiche und binden das
  // Theme-Skript nicht ein; dort steht die Farbwelt am Wurzelelement, das Theme nicht.
  //
  // `:not([data-theme])` und nicht `:root` allein: sonst stünde die helle Träger-Welt mit
  // Spezifität (0,2,0) im Ring gegen die Keyholder-Blöcke, und welche Welt eine Admin-Seite
  // bekommt, entschiede die Reihenfolge der Blöcke. So schliessen sich die beiden Fälle aus.
  if (name === 'user') sel.unshift(`:root[data-ident="${welt}"]:not([data-theme])`)
  return sel
}

/** Das PRÄFIX der Anfangsmarke — nicht ihr voller Text.
 *
 *  Der volle Text stand einmal als Suchbegriff hier, und dann wurde er umformuliert („der grüne
 *  Identitäts-Ton" → „die übrigen Farbwelten"). Der Schreiber fand den alten Abschnitt danach
 *  nicht mehr, liess ihn stehen und hängte den neuen dahinter: 226 Zeilen veralteter Werte im
 *  Blatt, die nur deshalb nichts anrichteten, weil der neue Block später kommt und gewinnt. Wer
 *  seinen eigenen Marker nach dem Titel sucht, verliert ihn beim ersten Umformulieren. */
const MARKE_PRAEFIX = '/* ══ ERZEUGT von docs/design/tokens.mjs'
const MARKE_AUF = `${MARKE_PRAEFIX} — die übrigen Farbwelten ══`
const MARKE_ZU = '/* ══ Ende des erzeugten Bereichs ══ */'

function weltenAbschnitt() {
  const teile = [
    MARKE_AUF,
    `   Nur die Tokens, die sich von der Vorgabe (${WELT_VORGABE}) unterscheiden — der Rest erbt aus den`,
    '   vier Theme-Blöcken oben. Umgeschaltet wird am Gerät (Einstellungen → Farbwelt); so liegen die',
    '   Fassungen desselben Bildschirms nebeneinander statt in mehreren Bauten.',
    '   ═════════════════════════════════════════════════════════════════════════════════════ */',
  ]
  // Nach INHALT gruppiert, nicht nach Welt: `geteilt` benutzt für den Träger dieselben Werte wie
  // `gruen`, und ausgeschrieben wären das zweimal 81 Zeilen für denselben Block. Jede weitere
  // Welt, die eine bestehende Bereichs-Fassung wiederverwendet, spart hier ihre Duplikate mit.
  const bloecke = new Map()
  for (const welt of NEBENWELTEN) {
    for (const name of Object.keys(THEMES)) {
      const tokens = abweichung(welt, name)
      if (tokens.length === 0) continue
      const rumpf = tokens.map(zeile).join('\n')
      const schluessel = `${name}\u0000${rumpf}`
      if (!bloecke.has(schluessel)) bloecke.set(schluessel, { rumpf, selektoren: [] })
      bloecke.get(schluessel).selektoren.push(...identSelektoren(welt, name))
    }
  }
  for (const { rumpf, selektoren } of bloecke.values()) {
    teile.push('', selektoren.join(',\n') + ' {', rumpf, '}')
  }
  teile.push('', MARKE_ZU)
  return teile.join('\n')
}

/** Schneidet den erzeugten Welten-Abschnitt heraus: `[vor der Marke, nach der Endmarke]`.
 *  Fehlt er, ist der Rumpf das ganze Blatt und der Schwanz leer. */
function trenneWeltenAb(css) {
  // ALLE markierten Abschnitte, nicht nur den ersten: fand ein früherer Lauf seinen Marker nicht,
  // liegt mehr als einer im Blatt, und ein Schreiber, der nur einen einsammelt, verewigt den Rest.
  let erster = null
  for (;;) {
    const auf = css.indexOf(MARKE_PRAEFIX)
    if (auf < 0) break
    const zu = css.indexOf(MARKE_ZU, auf)
    if (zu < 0) throw new Error('Anfangsmarke ohne Endmarke — von Hand nachsehen')
    if (erster === null) erster = auf
    css = css.slice(0, auf) + css.slice(zu + MARKE_ZU.length)
  }
  if (erster === null) return [css, '']
  return [css.slice(0, erster).replace(/\s*$/, '\n'), css.slice(erster)]
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
  const [rumpf, schwanz] = trenneWeltenAb(css)
  css = rumpf
  for (const name of Object.keys(THEMES)) css = ersetzeBlock(css, name, tokensIn(WELT_VORGABE, name))
  css = css.replace(/\s*$/, '\n') + '\n\n' + weltenAbschnitt() + schwanz

  fs.writeFileSync(pfad, css)
  return css
}

if (process.argv[1]?.endsWith('tokens.mjs')) {
  if (process.argv.includes('--write')) {
    const pfad = new URL('../../src/app/globals.css', import.meta.url).pathname
    schreibe(pfad)
    for (const welt of NEBENWELTEN) {
      const zahlen = Object.keys(THEMES).map((n) => `${n}: ${abweichung(welt, n).length}`)
      console.log(`  ${welt} — Abweichungen (${zahlen.join(', ')})`)
    }
    console.log('globals.css geschrieben — vier Theme-Blöcke plus die Welten oben.')
  } else {
    for (const name of Object.keys(THEMES)) {
      console.log(`\n[data-theme="${name}"] {`)
      for (const [k, v] of tokensIn(IDENTITAET, name)) console.log(zeile([k, v]))
      console.log('}')
    }
  }
}
