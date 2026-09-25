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

## Grenzen — bewusst so

- **Kein Notausgang im Tracker.** Öffnen kann die Box nur, wer das Passwort kennt, und das kennt nur
  der Tracker. Fällt er aus, bleibt der physische Weg.
- **Der Stand ist so alt wie der letzte Kontakt.** Zwischen zwei Verbindungen weiss der Tracker nichts
  über die Box; `lastSyncAt` ist dieser Kontakt. Die Schlüssel-Telemetrie (`boxKeyProof.ts`) zählt
  nur Heimdall-Boxen — eine stumme LockMeBox belegt nicht, dass der Riegel stilllag.
- **Keine Failsafes, keine Frist in der Box.** Sie öffnet nie von selbst.
