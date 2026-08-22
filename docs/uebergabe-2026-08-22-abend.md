# Übergabe — Stand 22.08.2026, Abend

Zweite Sitzung dieses Tages. Die erste hat `docs/uebergabe-2026-08-22.md` hinterlassen (Stand
Vormittag: Funktionsmodell, Gestaltungs-Entwurf, Redesign-Plan A–F). Diese Datei ist der Einstieg
für die nächste.

**Kurz:** Etappe A und C des Redesign-Plans sind fertig und auf `main` (v5.3.0). Die Flotte fährt
noch v5.2.9. Als Nächstes steht **Etappe B** an — der Worktree dafür ist angelegt, es ist noch
keine Zeile geschrieben.

## Was ausgeliefert ist

| Version | Was | Wo |
|---|---|---|
| **v5.2.7** | MCP schreibt Geräte und Kategorien | umnummeriert (war v5.3.0), `feat` → `fix` |
| **v5.2.8** | Etappe A: ein Dauer-Format, benannte Prozentwerte | `main`, Flotte |
| **v5.2.9** | Summen in Stunden, Spannen in Tagen | `main`, Flotte |
| **v5.3.0** | Etappe C: konfigurierbare Dashboards, vier Oberflächen | `main`, **nur `:feature`** |

### Ringe

```
main       v5.3.0
:feature   v5.3.0   nur trublue
:portal    v5.2.9   23 Instanzen
:latest    v5.2.5   Self-Hoster — fünf Versionen zurück
release    v5.2.5
```

**Die Flotte hat Etappe C nicht.** Ein `main`-Build mit `tagFeature=true` zöge sie nach — und
liesse dabei die Migration `dashboard_layout` auf allen 23 Instanzen laufen (additiv, nullable,
Rückroll gefahrlos). Braucht ausdrückliches OK.

## Etappe A — was daraus zu wissen ist

Acht Schreibweisen für eine Dauer wurden auf eine gebracht (**wortteilig**, `2T 3h 14min`), und
danach kam die eigentliche Erkenntnis: **eine Spanne und eine Summe sind zwei verschiedene
Grössen.**

- **Spanne** — durchgehender Zeitraum, die Tage sind echte Tage. `formatDurationMs` / `-Hours` /
  `-Between`, dazu `formatElapsedMs` (laufend) und die Uhr in `TimerDisplay`.
- **Summe** — zusammengezählte Zeit, nennt **nie** Tage. `formatTotalMs` / `formatTotalHours`.
  Ab 1000 Stunden ohne Minuten, Tausender mit geschütztem Leerzeichen (`5 340h`).

Ausgelöst hat es trublues Einwand: „Diese Woche 3T 2h 36min" war rechnerisch richtig und trotzdem
falsch — es waren 74 Stunden über fünf Kalendertage, und weil eine Woche sieben Tage HAT, liest
sich „3T" als „3 von 7". Bei den Zielen ist es am deutlichsten: die Keyholderin trägt 130 Stunden
ein, also soll dort auch `130h` stehen.

Prozentwerte haben drei Bedeutungen und heissen jetzt danach: `goalPct` (Nenner: das Soll),
`coveragePct` (verstrichene Spanne), `sharePct` (eine Summe), `ratioPct` (fertiges Verhältnis).
Eine Zahl ohne ihren Nenner ist unfertig — Vorbild ist `stats.percentLocked`.

Gesichert durch `displayFormatRegistry.ts` + `displayFormatSurfaces.ts` + Test: ein Scanner liest
die tatsächlichen Anzeigestellen aus dem Quelltext, der Test bricht bei einer selbstgebauten Dauer
oder einer eigenen Prozent-Rechnung. **Das Gate hat sich sofort bezahlt gemacht** — es fand drei
weitere von Hand gebaute Dauer-Fassungen, die keinen der acht Formatierer aufriefen.

## Etappe C — was gebaut ist

Vier Oberflächen sind konfigurierbar: Träger-Dashboard (15 Blöcke), Träger-Statistik (12),
Keyholder-Statistik (12), Keyholder-Sub-Detail (14).

- `dashboardBlockRegistry.ts` — Id, Oberfläche, Rolle, Beschriftung, Reihenfolge.
- `dashboardLayout.ts` — Speicherform und Misch-Regel, rein und testbar.
- `viewerLayout.ts` — die Konfiguration des **Betrachters**, nicht des Betrachteten.
- `DashboardStack.tsx` — der Bearbeiten-Modus als Zeilenliste.
- `User.dashboardLayout` (JSON, nullable), Schreibroute `/api/settings/dashboard-layout`.

**Drei Dinge, die man wissen muss, bevor man daran weiterbaut:**

1. **Die Vollständigkeit erzwingt der Compiler**, nicht ein Test. Jede Seite baut ihre Blöcke als
   `Record<…BlockId, ReactNode>`; ein vergessener Block ist ein Typfehler, ein erfundener ebenso.
   `BlockIdOf<S>` bindet die Oberfläche an ihre Ids.
2. **Gespeichert werden Abweichungen, nicht die Blockliste.** Sonst bliebe jeder künftige Block bei
   Bestandsnutzern unsichtbar. Ein neuer Block wird an der Stelle eingefügt, an der er im Standard
   steht — nicht hinten angehängt.
3. **Die Rollen-Grenze ist Sicherheit.** Eine Oberfläche gehört als GANZE einer Rolle;
   `checkLayoutPatch` lehnt ab statt still zu verwerfen.

## Was jetzt ansteht: Etappe B

**Worktree `../kg-block-loaders`, Branch `feat/block-loaders` von `main` — angelegt, leer.**

Heute lädt `dashboard/page.tsx` alles in einem `Promise.all` (elf Abfragen), bevor überhaupt ein
Block entsteht. Ein ausgeblendeter Block spart deshalb die **Übertragung**, aber nicht die
**Abfrage**.

B kehrt das um: jeder Registereintrag bekommt ein `load(ctx)`, die Seite ruft nur die Loader der
sichtbaren Blöcke, geteilte Abfragen laufen über React `cache()` (Vorbild
`getControllableSubsCached` in `keyholder.ts` — Argumente primitiv halten, `cache()` schlägt über
ihre Identität nach).

Betroffen sind dieselben vier Oberflächen. **Prüfkriterium wie bei C: der Bildschirm sieht danach
exakt gleich aus.**

**Warum jetzt und nicht später:** das Register steht frisch und die Blöcke sind benannt. D und E
fassen dieselben Dateien noch einmal an — B danach zu machen hiesse, sie ein drittes Mal
aufzumachen.

## Entscheidungen, die schon gefallen sind

Nicht neu fragen:

| Frage | Entscheidung |
|---|---|
| Layout-Hoheit | Jeder konfiguriert nur sich selbst |
| Themes (Etappe D) | Ersetzen, **alle vier Fassungen** — die hellen sind erst zu entwerfen (D0) |
| Box Soll/Ist | **Melden**, Sperrzeit bleibt stehen. Kein Strafbuch-Eintrag — der Träger kann nichts dafür |
| Pflicht-Blöcke ausblendbar | Ja, alles darf weg. Glocke, Badge, Mail und Push bleiben unberührt |
| Dauer-Format | Wortteilig, Spanne/Summe getrennt |
| Bearbeiten-Modus | Zeilenliste, keine Drag-and-drop-Bedienung |

## Offene Fäden

- **Flotte auf v5.3.0 nachziehen** (`:portal`) und danach **`:latest` promoten** — die Self-Hoster
  stehen fünf Versionen zurück.
- **Box Soll/Ist** — entschieden, nicht gebaut. Ein Nachmittag, schliesst den letzten Punkt der
  Vormittags-Übergabe. Berührt `docs/funktionsmodell/60-box.md` und `90-kollisionen.md`.
- **`design/entwurf`** liegt auf dem Remote, nicht gemergt. Nur Doku (Gestaltungs-Entwurf +
  Vormittags-Übergabe), auf `main` aufsitzend. Grundlage für D.
- **Etappe D0** — die hellen Fassungen der neuen Palette entwerfen. Der Entwurf existiert nur
  dunkel, und die Helligkeits-Rampe trägt auf Weiss nicht 1:1.
- **Etappe E** — 118 Komponenten, `Card` in 34 Dateien, 825 hartkodierte Schriftgrössen.
- **Etappe F** — Issue #37 (Träger erbittet Aufschluss/Orgasmus, eigenes Modell **mit Zustand**),
  Notizen in der Oberfläche (Achtung: die MCP-Wissensschicht ist bewusst unsichtbar — was davon
  sichtbar wird, ist eine Produktentscheidung).

### Zwei fremde Worktrees

```
kg-gewicht   feat/gewicht           docs(gewicht): Konzept für Gewichtstracking
kg-weight    feat/weight-tracking   docs(gewicht): Konzept für Gewichtstracking
```

Zwei Worktrees, zwei Branches, derselbe Commit-Titel — offenbar dieselbe Aufgabe doppelt
gestartet. Beide nur lokal, nichts auf dem Remote. **Nicht angefasst.** Wer daran weiterarbeitet,
sollte zuerst klären, welcher der beiden gilt.

## Der Versions-Vorfall — und die Regel daraus

Zwei Sitzungen legten die Versionsregel an einem Tag verschieden aus: v5.2.6 blieb mit drei
`feat`-Einträgen Patch, v5.3.0 zog für die MCP-Schreibrechte die Minor-Stelle. Korrigiert per
Umnummerierung auf v5.2.7/v5.2.8 — **mit Force-Push auf die veröffentlichte Hauptlinie.**
Vertretbar war er nur, weil kein `:v5.3.x`-Image existierte und der `release`-Tag unberührt blieb.

Daraus steht jetzt in **beiden** `CLAUDE.md`:

- **Sitzungen bumpen ausschliesslich die Patch-Stelle.** Die Minor-Stelle zieht trublue selbst.
  Ein `feat`-Eintrag ist dafür kein hinreichender Grund.
- **Was eine Schnittstelle nachholt, um mit einer anderen gleichzuziehen, ist ein `fix`.** Der MCP
  soll können, was die Keyholderin in der Oberfläche kann; eine Fähigkeit, die es dort längst
  gibt, schliesst eine Lücke.

*(v5.3.0 für Etappe C kam auf ausdrückliche Ansage — kein Automatismus.)*

## Arbeitsweise, die sich bewährt hat

**Register + Compiler schlägt Register + Test.** Wo sich Vollständigkeit als Typ ausdrücken lässt
(`Record<BlockId, ReactNode>`), braucht es keinen Test. Der Test bleibt für das, was ein Typ nicht
sieht: doppelte Ids, fehlende Übersetzungen, Reihenfolge.

**Struktur-Abzug statt Pixel-Vergleich.** `scripts/dashboard-snapshot.mjs` nimmt Reihenfolge, Tag
und Text der Blöcke und normalisiert Ziffern. Ein Screenshot-Diff wäre hier wertlos — auf dem
Dashboard tickt ein Countdown. Zwei Fallen, beide inzwischen behoben:

- Ziffern-**folgen** normalisieren, nicht Einzelziffern — sonst leckt die Stellenzahl durch.
- Vorher und Nachher **dicht hintereinander** aufnehmen. Ein älterer Vergleich meldete
  Abweichungen, die reiner Zeitablauf waren (eine geseedete Frist war abgelaufen).

**Am laufenden Bild prüfen, nicht nur bauen.** Das hat in dieser Sitzung Fehler gefunden, die
weder Tests noch Compiler sahen: zwei Layout-Brüche (abgeschnittene Prozentzahl, dreizeilige
Kachel) und ein React-Batching-Fehler, bei dem zwei schnelle Klicks auf denselben Pfeil einen
verschluckten.

**Der Dev-Server hält den Prisma-Client im Speicher.** Nach einer Migration neu starten, sonst
meldet er stur `Unknown field`.

### Testumgebung aufsetzen (für die vier Oberflächen)

```bash
git worktree add ../kg-<name> -b feat/<name> origin/main
cd ../kg-<name> && npm install && npx prisma generate
cp ../chastitytracker/.env.local .env.local   # DATABASE_URL und NEXTAUTH_URL auf den eigenen Port biegen
DATABASE_URL="file:/tmp/kg-<name>/db.db" npx prisma migrate deploy
# Konto anlegen, Trainingsvorgabe setzen, dann:
DATABASE_URL="…" node scripts/seed-testdata.mjs <user>
npm run snapshot -- <user> <passwort> vorher.json <port> [subId]
```

Für einen aussagekräftigen Abzug braucht es zusätzlich eine offene Kontrolle und zwei Kategorien
(eine mit Gerät, eine ohne) — sonst rendern nur 5 der 15 Dashboard-Blöcke.
