# Der Riegel entscheidet, nicht der Eintrag

**Status:** **fertig gebaut** (30.08.2026).
**Erstellt:** 2026-08-30
**Branch:** `claude/tracker-neue-ideen-78cb99` (v6-Zweig)
**Auslöser:** Idee von trublue — „bei einem User mit Box ist das Eintragen des Zustands
‚Verschlossen' erst der Aufruf zum Box-Schliessen. Erst wenn der Knopf gedrückt wurde und die Box
‚Riegel zu' meldet, schaltet der Tracker um."

---

## 1. Der Zuschnitt in einem Absatz

Bei einem Träger, für den die Keyholderin es eingeschaltet hat, ist ein `VERSCHLUSS`-Eintrag ein
**Aufruf**: sofort geschrieben, aber für jede Ableitung **unsichtbar**, bis die Box „Riegel zu"
meldet. Erst diese Meldung **vollzieht** ihn — sie setzt die Startzeit, hakt Anforderungen ab,
schaltet die Farbwelt auf Grün und meldet es der Keyholderin. Drückt niemand den Knopf, passiert
nichts: kein Verschluss, keine Sperrzeit, keine Tragezeit, keine erfüllte Anforderung. Der Aufruf
bleibt stehen, bis er vollzogen oder zurückgenommen wird.

**Warum das mehr ist als Kosmetik.** Bisher war der Eintrag die Behauptung, und die Box folgte ihm.
Seit dem Präsenz-Gate (FW 0.2.34) braucht die Box aber einen Knopfdruck am Gerät — sie kann also
offen stehen, während der Tracker längst „verschlossen" sagt. Genau diese Lücke schliesst die Regel:
was der Tracker als Verschluss zählt, ist dann durch Hardware gedeckt.

## 2. Die Entscheide

| Frage | Entscheid |
|---|---|
| Was ist die Startzeit? | Der Zeitpunkt des Riegels — nicht der des Aufrufs. Das Zeitfeld im Formular entfällt für diesen Fall. |
| Wird der Aufruf nie eingelöst? | Dann passiert nichts. Keine Frist, keine Mahnung, kein Vergehen — er hat sich schlicht nicht eingeschlossen. |
| Reinigungs-Wiederverschluss | Zählt **erst mit dem Riegel**. Die Frist läuft bis dahin weiter. |
| Verschluss-Anforderung / Sperrzeit | Ebenfalls erst mit dem Riegel erfüllt. |
| Welches Signal gilt? | `BoxEvent LOCKED` **oder** ein Status-Push mit `reportedLocked: true` — wer zuerst kommt. Bei mehreren Boxen gewinnt die erste Meldung. |
| Reisefall (`keyInBox: false`) | Kein Warten. Die Box bekommt gar kein Kommando, es käme nie eine Meldung. |
| Keine Box / Keyholder-Pfad | Kein Warten — Bestandsverhalten. |
| Box meldet den Riegel schon zu | Sofort vollzogen, sofern die Meldung **frisch** ist (`boxIsLive`, < 2 min). Ohne diesen Ausstieg käme nie ein neues Ereignis und der Aufruf hinge für immer. |
| Farbwelt während des Aufrufs | Bleibt **rosa/offen**. Er ist nicht verschlossen, und die Welt sagt den Zustand, nicht die Absicht. |
| Meldung an die Keyholderin | Erst beim Vollzug. Beim Aufruf wäre „hat sich eingeschlossen" eine Behauptung über etwas, das noch nicht passiert ist. |
| Zurücknehmen | Ja, durch Löschen des Eintrags („ist nie passiert"). Das noch nicht abgeholte Box-Kommando wird mit gestrichen. |
| Ein zweiter Aufruf | Abgewiesen (`LOCK_ALREADY_PENDING`). |

## 3. Wie es technisch hält — zwei Trichter

Der ganze Verschluss-Zustand des Trackers läuft durch genau **zwei** Stellen. Deshalb genügt es,
den schwebenden Aufruf dort auszublenden, statt ihn an dreissig Aufrufstellen einzeln zu behandeln:

| Stelle | Was sie speist |
|---|---|
| `getLatestKgEntry()` (`queries.ts`) | `getIsLocked`, `getCurrentLockKeyInBox`, alle Eintrags-Guards, Kontroll-Ziel, Bildersafe |
| `filterAndSortPairEntries()` (`utils.ts`) | `buildPairs` → `buildSessions`, `buildKgWearPairs` → Dashboard, Statistik, Kalender, Trainingsziele, Strafbuch, MCP |

Die Regel selbst steht einmal in `lockPending.ts` — als Prisma-Filter und als Prädikat. Dass kein
Aufrufer sie umgeht, erzwingt der Compiler: `boltConfirmedAt` ist **Pflichtfeld** der Paar-Signatur,
ein Select ohne die Spalte kompiliert nicht.

Daneben bleiben vier Stapel-Abfragen, die den Zustand für VIELE Träger auf einmal beantworten
(Keyholder-Übersicht, Kopfzeile, Benutzerliste). Sie teilen sich seither `latestKgTimesByUser()`,
statt denselben Filter dreimal einzeln zu tragen.

**Der Vollzug** liegt in `lockCommit.ts`, ebenfalls an einer Stelle für alle Auslöser:
`commitPendingLock(userId, at)`. Die gemeldete Zeit wird auf `[createdAt, jetzt]` **geklemmt** —
eine falsch gestellte Box-Uhr darf weder in die Zukunft datieren noch hinter den Aufruf zurück und
so eine verpasste Frist retten.

## 4. Der Schalter

`User.lockRequiresBolt`, Vorgabe **aus**. Die Keyholderin legt ihn je Träger um — in
`/admin/users/[id]/einstellungen` (Abschnitt „Box", sichtbar nur, wo eine Box gemeldet hat) oder
über den MCP mit `set_box`. Beim Ausrollen ändert sich also für niemanden etwas; die Rückfüllung der
Migration setzt `boltConfirmedAt = startTime` für jeden bestehenden Verschluss, sonst läse die
ganze Flotte im Moment des Deploys „nicht verschlossen".

**Das Abschalten vollzieht einen wartenden Aufruf sofort.** Das ist kein Nebeneffekt, sondern der
zweite Zweck des Schalters: er ist der **Notausgang bei defekter Box** — der einzige bedienbare Weg,
einen Aufruf zu vollziehen, wenn die Meldung nie kommt.

## 5. Was der Träger sieht

Der Zustands-Held des Dashboards sagt „Verschluss angefordert", zählt seit dem Aufruf hoch und
nennt die Handlung: den Knopf an der Box drücken. Darunter steht „Aufruf zurücknehmen". Der
Wiederverschluss-Knopf einer Reinigungspause weicht ihm — er führte in ein Formular, das mit
`LOCK_ALREADY_PENDING` absagt, und ein Knopf, der in eine Absage führt, ist schlimmer als keiner.

Läuft gleichzeitig eine Reinigungspause, bleibt **ihr** Countdown die grosse Zahl: die Frist ist
das, was abläuft, der Aufruf das, was zu tun ist.

Die Box-Karte sagt dasselbe schon über `boxPendingTransition` → `"closing"` — beide lesen dieselbe
Ableitung, es gibt keinen zweiten Text.

## 6. Was die KI-Keyholderin sieht

`get_context.box` trägt den Schalter, ob überhaupt eine Box gemeldet hat, und seit wann ein Aufruf
wartet. `get_box_state` und `keyholder_dashboard` tragen `lockCallWaitingSince`. Ohne dieses Feld
sähe die Absicht des Trägers für sie aus wie Untätigkeit: `currentRun` ist leer, obwohl er den
Verschluss längst erfasst hat.

Geschrieben wird mit `set_box` — ein Werkzeug je Einstellungs-**Familie**, nicht je Feld: die
nächste Box-Einstellung kommt dort hinein.

## 7. Bewusst NICHT gebaut

- **Keine Frist auf den Aufruf.** Sie wäre ein zweites Fristensystem neben der
  Verschluss-Anforderung, die es für genau diesen Zweck schon gibt.
- **Keine dritte Farbwelt.** Sie kostet vier Stellen (`WELTEN`, `World`/`WORLDS`, ein Token-Lauf,
  die Farbtafel im nicht versionierten iOS-Projekt) und sagte nichts, was die Zeile im Helden nicht
  sagt.
- **Kein Push beim Aufruf.** Der Träger steht in dem Moment vor seinem Telefon — er hat gerade
  gespeichert.
- **Kein Un-Armen einer schon abgeholten Box.** Nimmt er den Aufruf zurück, nachdem die Box das
  Kommando gezogen hat, schliesst sie auf Knopfdruck trotzdem — ohne Eintrag. Derselbe Zustand wie
  bei jedem anderen von Hand verriegelten Schloss; die Box-Karte zeigt ihn.

---

← Zurück zum [Haupt-README](../README.md).
