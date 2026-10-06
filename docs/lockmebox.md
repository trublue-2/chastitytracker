# LockMeBox mit Werks-Firmware

Neben der Heimdall-Box kann der Tracker eine **LockMeBox mit unveränderter Werks-Firmware** führen.
Sie hat kein Netz, nur Bluetooth. Das Handy des Trägers ist deshalb ein reines Relais zwischen Box
und Tracker — in der iOS-App und im Browser (Chrome/Edge auf Android und am Computer; Safari und
damit jeder Browser auf dem iPhone kann kein Web Bluetooth).

## Einschalten

Auf der Instanz `BLE_BRIDGE_KEY` setzen (32 Hex-Zeichen), den Schlüssel der Bluetooth-Brücke. Er
kommt vom Betreiber und steht nicht im Repo. Ohne ihn gibt es weder die Route noch den
Einstellungs-Eintrag.

## Ablauf

1. **Einmal koppeln:** Einstellungen → „Schlüsselbox (LockMeBox)" → Knopf an der Box drücken →
   „Mit Box verbinden". Der erste Kontakt legt die `BoxStatus`-Zeile an (`kind = "lockmebox"`) und
   erzeugt das Box-Passwort (`lockPassword`, 10 Zeichen, einmal je Box, nie gewechselt). Danach
   zeigt der Eintrag nur noch, welche Box gekoppelt ist.
2. **Die Box folgt den Einträgen** wie die Heimdall-Box: ein Verschluss setzt `pendingCommand =
   "lock"`, eine erlaubte Öffnung `"open"` (`boxCommand.ts`). Eine verbotene Öffnung erzeugt kein
   Kommando — die Box bleibt zu, der Eintrag dokumentiert den Bruch sofort.
3. **Der Tracker schaltet erst nach dem OK der Box um — in beide Richtungen.** Verschluss und
   Öffnung sind bei der LockMeBox immer erst ein AUFRUF (ohne Schalter): der Verschluss gilt mit
   „Riegel zu" (`lockAwaitsBolt`, docs/riegel-konzept.md), die Öffnung mit „Riegel offen"
   (`Entry.openAwaitsBolt`, `openAwaitsBolt`/`commitPendingOpen` in `lockCommit.ts`). Bis dahin
   ist der Aufruf für jede Ableitung unsichtbar; der Held zeigt ihn samt „Aufruf zurücknehmen".
4. **Ausgeführt wird, sobald jemand an der Box ist.** In der App sucht die Box-Karte im Hintergrund
   nach genau der gekoppelten Box — Knopf an der Box drücken genügt. Im Browser verbindet Web
   Bluetooth nur nach einem Klick, dort bleibt der Knopf „Mit Box verbinden". Je Schritt holt das
   Handy bei `POST /api/box/ble` den nächsten Befehl (fertig verschlüsselt) und reicht die Antwort
   der Box zurück (`lockmeboxService.ts`).

**Mitteilung „Box wartet".** Weil das Handy nur sucht, solange die App offen ist, bekommt der Träger
eine Push-Mitteilung, sobald ein Befehl für seine LockMeBox ansteht — auch wenn er im Browser
verschlossen oder die Keyholderin freigegeben hat. Antippen öffnet die Übersicht, deren Box-Karte
selbst sucht (`announceBoxCommand` in `boxCommandNotify.ts`, dieselbe Stelle, die Heimdall den
Instant-Push schickt). Sie folgt der Push-Stufe des Trägers wie eine wichtige Meldung.

**Das Box-Foto kommt nach dem Riegel** (`boxPhotoDue.ts`, `boxPhotoDueService.ts`). Der
Verschluss-Dialog fragt es nicht mehr ab: bei noch offener Box belegt ein Foto nichts, der Schlüssel
liesse sich danach wieder herausnehmen. Meldet die Box „Riegel zu" (`boxReportedLockedSafe` in
`lockCommit.ts` — der eine Einstieg von Heimdall-Ereignis, Heimdall-Status und Bluetooth), wird für
den laufenden Verschluss mit `keyInBox: true` einmal `Entry.boxPhotoDueAt` gesetzt. Der Träger bekommt
eine Push-Mitteilung und im Dashboard die Aufforderung „Box-Bild mit sichtbarem Schlüssel
hinterlegen" (`BoxPhotoDueCard`); sie bleibt, bis das Bild da ist. Das Bild geht an
`POST /api/entries/<id>/box-photo`, landet in `Entry.boxImageUrl` und wird wie bisher server-seitig
auf den Schlüssel geprüft. Der Verschluss gilt auch ohne Bild; öffnet der Träger vorher, erledigt sich
die Aufforderung. Verschlüsse, die älter sind als diese Regel, hat die Migration auf „erlassen" gestellt;
ihnen wird nichts nachgefordert. Notausgang: die Keyholderin erlässt das Bild (`Entry.boxPhotoWaivedAt`, Route
`/api/admin/box-photo`, MCP `waive_box_photo`). Die Aufnahmezeit des Fotos (EXIF, sonst Dateizeit) wird mit „Riegel zu" verglichen: liegt sie mehr als fünf Minuten davor, wird das Foto angenommen, aber markiert (`Entry.boxImageBeforeBolt`, `boxPhotoTakenBeforeBolt`) — die Session-Zeile zeigt „Foto vor Riegel zu". Die Zeit liefert das Gerät, es ist ein Hinweis, kein Beweis. Kontrollen verlangen ihr Box-Foto unverändert.

**Eine Box je Träger** (`boxPairing.ts`). Der Schlüssel liegt in einer Box; mit zweien liefen die
Regeln auseinander (ein Verschluss gälte mit dem Riegel irgendeiner Box, eine Öffnung nur mit der
LockMeBox). Beide Kopplungswege — der erste Bluetooth-Kontakt und der erste Heimdall-Sync einer
unbekannten Box — lehnen deshalb eine zweite Box ab (`BOX_ONE_PER_USER`). Gewechselt wird über
„Box entfernen" in den Einstellungen (`DELETE /api/box/<boxId>`), und das nur, wenn der Träger offen
ist, die Box nicht als zu gemeldet hat und weder Aufruf noch Kommando wartet — eine verschlossene
LockMeBox verlöre mit ihrer Zeile das Passwort. Eine Heimdall-Box muss zusätzlich bei Heimdall
abgemeldet werden, sonst legt ihr nächster Sync die Zeile wieder an.

Die Box schläft etwa eine Minute nach dem letzten Kontakt ein und ist dann nur nach einem Druck auf
ihren Knopf zu finden. Öffnet die Keyholderin, während eine Öffnung des Trägers noch wartet, verwirft
der Vollzug die überholte Öffnung, statt eine zweite hinterherzuschieben.

## Protokoll

Nordic UART Service. Befehle gehen verschlüsselt an die Box, gesperrt wird nur mit
Passwort (kein Timer) und geöffnet mit `O/<pw>`. Antworten der Box sind Klartext mit 16 bzw. ab
Firmware 15 17 Feldern. Rahmung und Auswertung: `lockmeboxProtocol.ts` (importfrei, von Server und
Handy geteilt), Verschlüsselung: `lockmebox.ts` (nur Server).

## Das Passwort geht nie verloren, solange die Box zu sein könnte

Nur der Tracker kennt das Passwort (`BoxStatus.lockPassword`); verschwindet die Zeile einer
verschlossenen Box, bleibt nur der Hammer. Deshalb (`boxPasswordAtRisk` in `boxPairing.ts`):

- **Ab dem Senden des Schliessbefehls gilt die Box als „vermutlich zu"** (SOLL zu, IST unbekannt,
  `lockmeboxRelayStep`). Reisst die Verbindung ab, nachdem sie zugefahren ist, aber bevor ihre Antwort
  ankam, steht sonst „offen" in der Zeile. Erst eine spätere Meldung „offen" gibt sie wieder frei.
- **„Box entfernen"** verweigert, solange die Box zu ist oder sein könnte (dazu: Träger verschlossen,
  Aufruf oder Kommando wartet).
- **Einen Nutzer löschen** verweigert die Admin-Route ebenso (`USER_BOX_LOCKED`) — die Box-Zeile ginge
  per Kaskade mit.
- Das Passwort wird nie neu erzeugt; ein Backup bleibt deshalb gültig.

Ausserhalb des Trackers liegt: eine ganze Instanz samt Datenbank löschen.

## Grenzen — bewusst so

- **Kein Notausgang im Tracker.** Öffnen kann die Box nur, wer das Passwort kennt, und das kennt nur
  der Tracker. Fällt er aus, bleibt der physische Weg.
- **Der Stand ist so alt wie der letzte Kontakt.** Zwischen zwei Verbindungen weiss der Tracker nichts
  über die Box; `lastSyncAt` ist dieser Kontakt. Die Schlüssel-Telemetrie (`boxKeyProof.ts`) zählt
  nur Heimdall-Boxen — eine stumme LockMeBox belegt nicht, dass der Riegel stilllag.
- **Keine Failsafes, keine Frist in der Box.** Sie öffnet nie von selbst.
