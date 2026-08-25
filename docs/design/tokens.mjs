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
const BEDEUTUNG = {
  rosa:    { dunkel: '#ff3d68', hell: '#c3002b', flaeche: '#ff3d68' },  // der Zustand
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
const THEMES = {
  'user':        { hell: true,  grund: '#fcf7f8', erhoeht: '#f6eef1', feld: '#f0e5e9',
                   text: ['#2d1d26', '#634d55', '#7d656d'], tinte: '45,29,38' },
  'user-dark':   { hell: false, grund: '#0b0609', erhoeht: '#140d10', feld: '#241a1e',
                   text: ['#fdf7f8', '#c9b7bd', '#9a868e'], tinte: '255,255,255' },
  'admin-light': { hell: true,  grund: '#f7f8fc', erhoeht: '#eef1f8', feld: '#e5eaf3',
                   text: ['#1d2130', '#4d5363', '#646b7b'], tinte: '29,33,48' },
  'admin':       { hell: false, grund: '#070810', erhoeht: '#0f1119', feld: '#181b26',
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
      if (kontrast(c, th.feld) >= ziel) break
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
  const spitze = th.hell ? '#c3022d' : BEDEUTUNG.rosa.flaeche
  rampeZiele.forEach((ziel, i) => setze(`wear-${i}`, beiKontrast(th.grund, spitze, ziel)))
  // Die Ziffer richtet sich nach IHRER Zelle, nicht nach dem Grund (siehe hell.md).
  const aufZelle = (zelle) => {
    for (const kandidat of th.hell ? [th.text[2], th.text[1], th.text[0], '#3d0518', '#ffffff']
                                   : [th.text[2], th.text[1], th.text[0], '#3d0518'])
      if (kontrast(kandidat, zelle) >= 4.5) return kandidat
    return th.hell ? '#ffffff' : '#3d0518'
  }
  rampeZiele.forEach((ziel, i) => setze(`wear-${i}-text`, aufZelle(beiKontrast(th.grund, spitze, ziel))))

  // ── Kopfzeile und Navigation ───────────────────────────────────────────────
  // Hier wird die Kernregel des Entwurfs wirksam: die ROLLE sitzt im Grund, nicht im Akzent.
  // Vorher war der Träger-Bereich durchgehend grün und der Keyholder-Bereich indigo — dieselbe
  // Tatsache trug damit in zwei Bereichen zwei Farben. Jetzt sind Kopf und Navigation neutrale
  // Flächen; man erkennt den Bereich an der Temperatur des Raums.
  const akzent = BEDEUTUNG.rosa[art]
  setze('header-bg', th.erhoeht); setze('header-border', mix(th.grund, th.text[2], 0.22))
  setze('header-text', th.text[0])
  setze('header-avatar-bg', beiKontrast(th.grund, BEDEUTUNG.rosa.flaeche, PROFIL.border[art]))
  // Die Schrift steht auf der getönten Kachel, nicht auf dem Grund — der Akzent selbst hätte dort
  // nur 2,3:1. Die hohe Textstufe trägt in beiden Fassungen.
  setze('header-avatar-text', th.text[0])
  setze('nav-bg', th.erhoeht); setze('nav-border', mix(th.grund, th.text[2], 0.22))
  setze('nav-active-bg', th.feld); setze('nav-active-text', th.text[0])
  setze('nav-inactive-text', th.text[2]); setze('nav-inactive-hover', th.text[0])
  setze('nav-icon-bg', th.feld); setze('nav-icon-active-bg', akzent)
  setze('focus-ring', akzent)

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

if (process.argv[1]?.endsWith('tokens.mjs')) {
  for (const name of Object.keys(THEMES)) {
    console.log(`\n[data-theme="${name}"] {`)
    for (const [k, v] of themeTokens(name)) console.log(`  ${(k + ':').padEnd(26)}${v};`)
    console.log('}')
  }
}
