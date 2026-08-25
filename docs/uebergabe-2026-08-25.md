# Übergabe — Stand 25.08.2026

Das Redesign ist vom Dokument in den Code gekommen. Zwei von zehn Bildschirmen sind wirklich
gestaltet, der Rest hat neue Farben und den alten Aufbau. Ein Testbild liegt als eigener
Docker-Kanal bereit.

**Lies zuerst den Abschnitt „Arbeitsweise".** Er ist der wertvollste Teil dieser Datei — zwei
Fehlläufe dieser Sitzung gingen darauf zurück, dass er noch nicht geschrieben war.

## Wo was liegt

| | |
|---|---|
| `chastitytracker/` | Zweig `main`, v5.3.10 — **unangetastet**, die funktionierende App |
| `kg-cat-chips/` | Zweig `design/entwurf`, gepusht — das Redesign, 15 Commits vor `main` |
| Testbild | Docker-Kanal `:design` (**nicht** `:feature`), Commit `1a20d99` |
| Dev-Server | Port 3400 aus `kg-cat-chips`, DB `/tmp/kg-cat-chips/db.db`, Konten `testsub` / `testkh` |
| Anleitung zum Bauen | `docs/testversion.md` |

**`main` wird nicht angefasst.** Ausdrückliche Ansage: das gesamte Redesign lebt in EINEM Zweig,
kein Merge — auch nicht für Fehlerbehebungen, die für sich genommen dorthin gehörten.

**Der oberste Prototyp-Commit `9759e55` heisst „NICHT MERGEN".** Seine Wirkung ist von späteren
Commits überschrieben (im Baum steht kein `data-variant` mehr), aber er gehört vor einer
Zusammenführung aus der Historie entfernt.

## Arbeitsweise — bitte nicht neu lernen

**trublue ist kein Designer und kann Gestaltung nicht spezifizieren.** Seine eigenen Worte: „Ich
kann es nicht formulieren – ich bin kein Designer. Ich kann nur auf mein Bauchgefühl hören."

Daraus folgt die Arbeitsteilung, und sie ist nicht verhandelbar:

> **Vorlegen statt fragen.** Bilder aus der laufenden App, er entscheidet nach Bauchgefühl.
> Keine Fragen, die eine Design-Sprache voraussetzen.

Zwei Fehlläufe dieser Sitzung, damit sie sich nicht wiederholen:

1. **Nur umgefärbt.** Der erste Anlauf stellte Tokens um und liess die Struktur stehen — derselbe
   Bildschirm, neu angemalt. Ursache: Farbe und Kontrast sind messbar, Nutzen nicht. Also entstand
   das Messbare zuerst und fühlte sich wie Fortschritt an.
2. **UX statt Ästhetik gebaut.** Auf „die UX soll nicht schlechter werden" — eine BEDINGUNG — folgte
   ein Feature. Gewollt war eine Evolution des Aussehens.

Der Massstab für jeden Schritt lautet deshalb: **welche Beschriftung kann weg?** Erst danach:
welche Farbe kommt hin.

**Der Gestaltungs-Entwurf in `docs/design/README.md` ist ein VORSCHLAG, kein Briefing.** Er stammt
selbst aus einer früheren KI-Sitzung. Zwei seiner Regeln haben Schaden angerichtet:

- *„Die Rolle sitzt im Grund, nicht im Akzent."* Begründet damit, sonst hiesse „verschlossen" beim
  Träger rosa und beim Keyholder indigo. **Das traf nicht zu** — die Bedeutungsfarben waren in
  beiden Rollen schon immer identisch (`--color-lock` war überall `#0d9151`). Die Rolle sass nur in
  der Umgebung. Ich bin der Regel gefolgt, habe ein Signal von ΔE 49,8 auf 2,9 heruntergefahren
  und musste es zurückbauen.
- *Die Marken-Rose als Identität.* Nie gefragt. trublues erste Reaktion: „es ist jetzt einfach
  schwarz/rot".

Wenn sein Bauchgefühl dem Entwurf widerspricht, gewinnt sein Bauchgefühl.

## Offen: grün oder rosa

Die App war grün (Träger) und indigo (Keyholder). Jetzt ist sie rosa. **Nicht entschieden.**

Blockiert nichts: der Identitäts-Ton ist in `docs/design/tokens.mjs` an EINER Stelle umschaltbar.

```bash
IDENTITAET=gruen node docs/design/tokens.mjs   # erzeugt die grüne Welt
```

Ein Vergleichsbild aus der laufenden App liegt vor. Beobachtung daraus, die über Geschmack
hinausgeht: in Rosa sind Warnung (Koralle) und Zustand (Rose) Nachbarn auf dem Farbkreis und
verschmelzen zu einem warmen Rotfeld — die Warnung verliert ihre Dringlichkeit. In Grün sind es
zwei klar getrennte Signale.

## Was gestaltet ist

**Träger-Übersicht** (`LaufendeSessionCard.tsx`) — die Dauer trägt den Bildschirm statt in einer
Karte zu stehen; der Zustand wird einmal genannt statt dreimal („Laufende Tragezeit" + „Verschlossen"
+ „Dauer:"); die Trainingsziele sagen, ob das Ziel noch zu schaffen ist, statt einen Prozentwert zu
zeigen (`goalOutlook.ts`, 7 Tests).

**Keyholder-Übersicht** (`admin/page.tsx`) — beginnt mit der Zahl der offenen Entscheidungen; nur
wer etwas braucht, steht ausgeklappt; der Rest ist eine leise Zeile.

**Überall wirksam:** vier Themes aus einem Generator · acht Bedeutungsfarben auf drei zusammengelegt
(zwei Paare waren vorher schon farbgleich) · Kopfzeile und Navigation tragen die Rolle · Kalender in
einer Helligkeits-Rampe statt in Blau · `Card` ohne Rahmen, `Button` ohne Schatten · Typo-Skala mit
sechs nach ihrer Aufgabe benannten Stufen.

## Was NICHT gestaltet ist

Einträge · Erfassen · Kategorien · Einstellungen · Sub-Detail · Kontrollen-Liste ·
Statistik-Kacheln. Neue Farben, alter Aufbau.

**Zwei Muster ziehen sich durch alle davon** — sie erklären das „hölzern" besser als jede Farbfrage:

1. **Alles sitzt in einem Kasten.** Kasten in Kasten, jede Zeile gleich schwer eingezäunt.
2. **Farbe sagt, WAS etwas ist, statt ob es wichtig ist.** In der Eintragsliste stehen zwölf
   korallene „Kontrolle" untereinander — alle längst erledigt. Koralle soll heissen „das will etwas
   von dir". Wenn sie auf allem steht, heisst sie nichts.

## Der nächste Schritt

**Der Sub-Bildschirm** (`admin/users/[id]/`) — der dichteste im Keyholder-Bereich: Zustand, offene
Punkte und zwölf Hebel auf einer Seite. Daran zeigt sich, ob das Muster der Übersicht auch trägt,
wenn viel auf den Schirm muss.

Vorgehen wie bei den zwei fertigen: **einen ganz fertig machen, Bild vorlegen, entscheiden lassen.**
Nicht drei halb.

## Werkzeuge in `docs/design/`

| Datei | Was |
|---|---|
| `tokens.mjs` | erzeugt alle vier Theme-Blöcke; `IDENTITAET=gruen` schaltet den Ton um |
| `kontrast.mjs` | Kontrast-Abzug über die Entwurfs-Blätter |
| `spiegeln.mjs` | spiegelt ein dunkles Entwurfsblatt nach hell; bricht ab statt zu raten |
| `README.md` / `hell.md` | der Entwurf (Vorschlag!) samt Herleitung |
| `umsetzung.md` | was im Code angekommen ist und warum |

Nach jeder Änderung an `tokens.mjs` die vier Blöcke in `globals.css` neu einsetzen — sonst wirkt
nichts. Ein Skript dafür steht in `umsetzung.md`.

## Fallen, die diese Sitzung gekostet haben

**Textstufen gelten nur für den Untergrund, gegen den sie gemessen wurden.** Dreimal
durchgefallen: die leise Stufe schafft auf dem Grund 5,0:1 und fällt auf `surface-raised` auf 4,32,
auf einem getönten Chip auf 4,2 und auf der aktiven Navigationsfläche auf 4,41. Sie ist jetzt gegen
die jeweils UNGÜNSTIGSTE Fläche kalibriert. Wer eine neue getönte Fläche einführt, prüft das mit.

**Am gerenderten Bild prüfen, nicht an der Token-Tabelle.** Alle Befunde dieser Sitzung hingen
daran — am Token gerechnet war jede einzelne Farbe korrekt.

**Der Kontrast-Abzug muss die Sichtbarkeit von VORFAHREN prüfen.** `getComputedStyle` meldet für ein
Kind eines `display:none`-Elters trotzdem dessen eigenen Wert. So wurde auf einem 390-px-Schirm die
ausgeblendete Desktop-Seitenleiste mitgemessen und vier Durchfaller gemeldet, die niemand sehen
kann. `el.checkVisibility()` fragt den gerenderten Zustand.

**Eine Textersetzung, die nicht trifft, schweigt.** Zweimal ist eine Ersetzung im Generator ins
Leere gelaufen, weil der Suchtext vorher schon einmal geändert worden war — die Werte sahen danach
plausibel aus und waren unverändert. Jede Ersetzung braucht ein `assert`.

**Der Dev-Server übersetzt CSS nicht immer neu.** Nach einer Änderung an `globals.css` hilft ein
`printf '\n' >> src/app/globals.css` plus ein paar Sekunden Wartezeit.

## Testbild bauen

```bash
gh workflow run docker.yml --ref design/entwurf -f publishAs=design -f deploy=false
```

`publishAs` ist neu (dieser Zweig): es veröffentlicht einen eigenen rollenden Kanal **statt**
`:feature`. Grund: auf `:feature` sitzen fremde Mittester, und der Tag wandert unabhängig davon,
welche Instanzen der Deploy anfasst. Reservierte Namen (`portal`, `latest`, `feature`, `v*`,
`sha-*`) brechen den Lauf ab — sonst publizierte ein Zweig am Promote-Riegel vorbei.

Kein Version-Bump auf diesem Zweig: `:v<version>`-Tags entstehen nur bei `main`-Builds, und eine
Nummer auf einem Zweig, der vielleicht nie gemergt wird, kollidiert später mit `main`.

## Testumgebung neu aufsetzen

Falls `/tmp` geleert wurde:

```bash
cd kg-cat-chips
DATABASE_URL="file:/tmp/kg-cat-chips/db.db" npx prisma migrate deploy
DATABASE_URL="file:/tmp/kg-cat-chips/db.db" ADMIN_USERNAME=testkh ADMIN_PASSWORD='…' node scripts/seed.js
# testsub anlegen + Beziehung zu testkh, dann:
DATABASE_URL="file:/tmp/kg-cat-chips/db.db" node scripts/seed-testdata.mjs testsub
```

Für aussagekräftige Bildschirme braucht es zusätzlich zwei Kategorien (eine mit Gerät), zwei
Trainingsvorgaben und eine offene Kontrolle — sonst rendern nur wenige Blöcke.

Bilder nimmt man mit Playwright auf; das Anmelde-Rezept steht in `scripts/dashboard-snapshot.mjs`
(`/api/auth/callback/credentials` mit CSRF-Token, `maxRedirects: 0`).
