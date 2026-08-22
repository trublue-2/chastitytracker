# Übergabe — Stand 22.08.2026

Aus einer langen Sitzung: Funktionsmodell, fünf Code-Etappen, ein Gestaltungs-Entwurf.
Diese Datei ist der Einstieg für die nächste Sitzung.

## Was ausgeliefert ist

**v5.2.6 auf `main`, gepusht, auf dem `:feature`-Ring ausgerollt** (2 von 23 Instanzen).

- **Funktionsmodell** (`docs/funktionsmodell/`) — 14 Steckbriefe, ein generiertes
  Stellschrauben-Register über alle 41 Modelle, eine Abhängigkeits-Ansicht je Mechanik, ein
  Funktionskatalog mit 87 Funktionen, eine Kollisionsliste. Drei der Dateien sind **generiert**
  (`npm run funktionsmodell`) und **testgesichert**: ein neues Schema-Feld, eine neue API-Route oder
  ein neues MCP-Werkzeug ohne Eintrag lässt `npm test` fehlschlagen.
- **Kategorie-Regeln** gehören dem Keyholder (`allowVorgaben`, `trackingEnabled`, `requirePhoto`);
  bei der eingebauten Kategorie für niemanden änderbar. Geprüft wird die ÄNDERUNG, nicht die
  Anwesenheit im Body — sonst nähme man Trägern mit älterer App das Umbenennen.
- **Zeitzone historisiert** (`TimezoneChange`). Eine Umstellung wirkt ab jetzt; vergangene
  Reinigungsöffnungen bleiben nach der damaligen Zone beurteilt.
- **Posteingang** bekommt eine Aufbewahrungsfrist (`MESSAGE_RETENTION_DAYS`, Vorgabe 365).
  Ungelesenes bleibt liegen, egal wie alt.
- **Strafbuch nennt den Urteilenden** (`StrafeRecord.judgedByName`, additiv neben dem Kürzel).
- **Zeitleisten-Felder pflichtig** — Zwischenschritt aus Issue #54.

## Was offen liegt

| Wo | Was |
|---|---|
| `main`, **ungepusht** | `e76c38a feat(mcp): Geräte und Kategorien über den MCP schreiben (v5.3.0)` — **aus einer anderen Sitzung**, nicht anfassen ohne Rückfrage |
| Branch `design/entwurf` | `0d5b016` — der Gestaltungs-Entwurf, nicht gemergt, nicht gepusht |
| Portal-Ring | hat v5.2.6 noch nicht; braucht einen eigenen Dispatch |

## Offene Entscheidungen (blockieren Arbeit)

1. **Etappe D des Funktionsmodell-Plans — Box: Soll/Ist.** Wenn die Box wegen Akku oder Funkstille
   von selbst öffnet, läuft die Sperrzeit weiter. **Melden oder versöhnen?** Empfehlung: melden —
   sonst löscht ein leerer Akku eine Anordnung der Keyholderin.
2. **Ersetzt das dunkle Gestaltungssystem die vier Themes, oder kommt es daneben?** Ersetzen
   bedeutet: die neue Palette auch **hell**, für beide Rollen — vier Fassungen. Der Entwurf existiert
   bisher nur dunkel.
3. **Darf die Keyholderin das Dashboard des Trägers konfigurieren?** Technisch dieselbe Mechanik,
   inhaltlich eine Machtfrage — und sie bestimmt, wem das Layout gehört.

## Der Redesign-Plan

Der Wunsch nach **konfigurierbaren Dashboards und Statistiken für beide Rollen** dreht das Vorhaben:
Modularität zuerst, Aussehen darauf. In der anderen Reihenfolge baut man jeden Bildschirm zweimal.

- **A — Sprache und Zahlen, kein Pixel.** Ein Dauer-Format überall; der Prozent-Widerspruch
  (dieselbe Dauer trägt 87 % und 81 % auf einem Bildschirm); doppelte Überschriften. Ein Tag, kein
  Risiko, unabhängig von allem. **Hier anfangen.**
- **B — Blöcke definieren, Aussehen unverändert.** `dashboard/page.tsx` sind 419 Zeilen mit elf
  Abfragen in einem `Promise.all`; die Blöcke sind dumm. Umkehren: jeder Block deklariert seine
  Daten, ein Register wie `FM_REGISTRY` mit Test. Prüfung: der Bildschirm sieht danach exakt gleich
  aus. **Hier liegt die eigentliche Arbeit.**
- **C — Konfigurieren.** Reihenfolge, Sichtbarkeit, Standards je Rolle.
- **D — Tokens ergänzen** (Typo-Skala, Bedeutungsfarben, alle vier Themes).
- **E — Bauteile ablösen, dann Bildschirme.**
- **F — Neue Fähigkeiten getrennt** (Aufschub erbitten #37, Notizen in der Oberfläche).

**Fallen bei B/C:** die Rollen-Grenze ist Sicherheit, nicht Anzeige (ein Träger darf sich nicht den
Notizen-Block der Keyholderin auflegen — der Server muss es durchsetzen). Speichere **Abweichungen
vom Standard**, nicht die Blockliste, sonst bleibt jeder künftige Block unsichtbar. Gegen doppelte
Abfragen hilft React `cache()` — Vorbild `getControllableSubsCached`.

## Zahlen zum Umfang

56 Seiten · 118 Komponenten · **1** Hex-Literal ausserhalb `globals.css` (die Token-Disziplin ist
sehr gut) · **827** hartkodierte `text-xs`/`text-sm` · `Card` in 38 Dateien · 1694 i18n-Schlüssel je
Sprache · **4 Themes** (Rolle × Modus) als Multiplikator auf alles.

## Der Gestaltungs-Entwurf

Siehe [`docs/design/README.md`](design/README.md) auf dem Branch `design/entwurf`: drei Farben mit je
einer Bedeutung, Intensität über Helligkeit, die Rolle im Grund statt im Akzent. Dort steht auch der
Weg dorthin — drei verworfene Anläufe und was der jeweilige Einwand verbessert hat.

## Befunde, die noch niemand behoben hat

1. Dieselbe Dauer trägt zwei Prozentwerte (`17:26 / 20:00 = 87 %` gegen `17:27 = 81 %`).
2. Vier Dauer-Formate nebeneinander.
3. Der Kontroll-Code ist das Grösste in jeder Zeile, obwohl nach der Erfüllung wertlos; die
   Verspätung muss man aus zwei grauen Zeitstempeln selbst ausrechnen.
4. Der Tragekalender kodiert Intensität in **Blau** — im Farbsystem bedeutet Blau `unlock`. Die
   Zielbalken stehen in **Indigo**, also `request`.
5. „KG-Tracker“ bricht in der Kopfzeile auf zwei Zeilen.
6. „TRAININGSVORGABEN“ steht zweimal auf demselben Bildschirm und meint zweierlei.

## Arbeitsweise, die sich bewährt hat

Register + Generator + Test. Dreimal hat das Gate in dieser Sitzung echte Fehler gefangen: ein neues
Schema-Feld ohne Eintrag, eine Paritäts-Abweichung zwischen Admin-Route und MCP, und eine
MCP-Referenz, die nur an einer von zwei Stellen ergänzt war. Ohne diese Bauart verrottet jede Doku —
das Farbsystem ist der Beleg dafür, was ohne sie passiert.
