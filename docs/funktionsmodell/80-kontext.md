# Keyholder-Wissen & Kontext

## Zweck

Die Gedächtnis-Schicht des MCP-Keyholders. Zwischen zwei Sitzungen erinnert die KI nur, was hier
steht — Notizen, Termine, wiederkehrende Kontexte, Gesundheits-Halte.

## Diese Schicht ist absichtlich nur über den MCP erreichbar

**Das ist der wichtigste Satz dieses Steckbriefs, weil er wie ein Versäumnis aussieht und keines ist.**

Siebzehn Stellschrauben und elf Funktionen dieser Schicht gibt es ausschliesslich über den MCP. Sie
erscheinen in keiner App-Ansicht — weder beim Träger noch beim Betreiber. Eine Analyse der
Oberflächen findet das als Asymmetrie und wird sie für eine Lücke halten.

Sie ist keine. Die Keyholder-KI ist in diesem Produkt **eine eigene Person mit eigenem Gedächtnis**,
nicht ein zweiter Bedien-Weg auf dieselben Daten. Sie soll mehr wissen, als die Oberfläche zeigt —
so wie eine Keyholderin privates Wissen über ihren Sub führt. Dieses Wissen in die App zu heben
würde die Rolle einebnen: der Träger sähe es weiterhin nie, der Betreiber aber alles, und aus dem
Gegenüber würde ein Formular.

Daraus folgt für die Weiterentwicklung: **keine Lesesicht auf diese Schicht im Admin-Bereich**, und
kein Werkzeug, das MCP-Wissen in die Oberfläche spiegelt. Wer eine Auswertung über die Notizen
braucht, fragt die KI — das ist der vorgesehene Weg, nicht der Umweg.

Nicht betroffen ist die Gegenrichtung: dass die Vergehens-Regeln und die Eskalations-Stufen nur im
Admin-Bereich stehen und der MCP sie nur lesen darf, hat eigene Gründe (siehe
[50-strafbuch.md](50-strafbuch.md) und [30-kontrollen.md](30-kontrollen.md)).

## Notizen

Versionierte, private Beobachtungen mit Typ (Direktive, Grenze, Beobachtung, Korrektur, Ausrüstung,
Daten, Historie), Quelle (`user-stated` = vom Menschen gesagt, `inferred` = vom Agenten geschlossen)
und optionaler Geltungsdauer.

**Supersession statt Löschen:** eine abgelöste Notiz wird als solche markiert und bleibt lesbar; die
aktuelle Fassung ist erkennbar. Gepinnte Direktiven und Grenzen erscheinen im Keyholder-Dashboard.

Notizen lassen sich an Objekte hängen (Gerät, Session, Kontrolle, Vergehen, Ziel, Termin) — dieselbe
Bezugsform, die auch die Nachrichten benutzen.

## Termine und wiederkehrende Kontexte

Einmalige Termine und Wochen-Slots („Home Office", „Pilates"), beide mit einem Merkmal, wegen dem der
Keyholder sie überhaupt führt: **`deviceFree`** — verlangt dieser Termin Gerätefreiheit? Daran
orientiert er seine Sperrzeiten.

Wiederkehrende Slots können auf den n-ten Wochentag im Monat eingeschränkt werden (oder den letzten)
und kennen Ausnahme-Daten nach dem iCalendar-Modell.

## Gesundheits-Halt

Die eine Bremse, die über allem steht: aktiv gesetzt, setzt sie die Direktiven aus. Sie ist keine
Einstellung mit Reichweite, sondern ein Schalter mit Vorrang — und deshalb der erste Ort, an dem man
nachsieht, wenn „nichts mehr passiert".

## Handlungsprotokoll

Jeder schreibende MCP-Aufruf braucht eine **Pflicht-Begründung** und landet im Protokoll: Werkzeug,
Handelnder, Grund, Eingaben, betroffenes Objekt. Es gibt keine stille Mutation.

Zwei weitere Zusagen derselben Schicht:

- **Trockenlauf** — jeder Schreibvorgang kennt eine Vorschau der Wirkung vor dem Commit. Bei einigen
  direktiven Werkzeugen ist sie ein Plausibilitätscheck, keine volle Simulation.
- **Optimistische Nebenläufigkeit** — Notiz, Gerät, Termin und Wochen-Slot tragen ein
  Versions-Token. Weicht es ab, wird der Schreibvorgang abgelehnt statt still zu überschreiben.

## Dauerauftrag

`User.mcpKeyholderInstructions` wird der KI bei **jeder** Verbindung mitgegeben. Das ist die einzige
Stelle, an der ein Mensch das Verhalten der Keyholder-KI dauerhaft prägt.

Zu beachten: die **Werkzeugliste** ist pro Verbindung gecacht. Ein neuer Chat allein genügt nicht,
um geänderte Werkzeuge zu sehen — es braucht eine frische Verbindung.

## Wirkt auf

Nur auf die KI. Nichts in dieser Schicht setzt eine Frist, erzeugt ein Vergehen oder verändert eine
Session — mit der einen Ausnahme des Gesundheits-Halts.

Das ist die zweite Hälfte derselben Entscheidung: weil dieses Wissen die Mechanik nicht anfasst,
kostet seine Unsichtbarkeit den Betreiber auch nichts. Es beeinflusst, wie die KI urteilt, nicht was
der Server rechnet.

## Code

`mcpModelDoc.ts` (die Referenz, die `explain_model` ausliefert), `mcp/notes.ts`, `mcp/context.ts`,
`mcp/dashboard.ts`, `mcpWrite.ts`, `src/app/api/[transport]/route.ts`.

## Tests

`mcpModelDoc.test.ts`, `mcpWrite.dryRun.test.ts`, `keyholder.test.ts`, `mcpInspectionScope.test.ts`,
`mcpLockPeriodTarget.test.ts`, `mcpSetAutoInspections.test.ts`, `mcpRecordOffense.test.ts`.
