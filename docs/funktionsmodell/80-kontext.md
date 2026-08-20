# Keyholder-Wissen & Kontext

## Zweck

Die Gedächtnis-Schicht des MCP-Keyholders. Zwischen zwei Sitzungen erinnert die KI nur, was hier
steht — Notizen, Termine, wiederkehrende Kontexte, Gesundheits-Halte. **Der Sub sieht nichts davon.**

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

## Code

`mcpModelDoc.ts` (die Referenz, die `explain_model` ausliefert), `mcp/notes.ts`, `mcp/context.ts`,
`mcp/dashboard.ts`, `mcpWrite.ts`, `src/app/api/[transport]/route.ts`.

## Tests

`mcpModelDoc.test.ts`, `mcpWrite.dryRun.test.ts`, `keyholder.test.ts`, `mcpInspectionScope.test.ts`,
`mcpLockPeriodTarget.test.ts`, `mcpSetAutoInspections.test.ts`, `mcpRecordOffense.test.ts`.
