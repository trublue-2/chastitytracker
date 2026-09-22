# Code-Box: der Tracker gibt den Öffnungscode aus

**Status:** **Idee, PoC ausstehend** · **Erstellt:** 2026-09-22
**Setzt voraus:** nichts Gebautes. Steht neben `docs/heimdall-box.md` (Hardware-Box) und dem
Bildersafe (`ENABLE_BILDERSAFE`), ersetzt keines von beiden.
**Auslöser:** die Frage, ob sich ein handelsüblicher Schlüsselsafe mit App-Code anbinden lässt
(Xcase SAF-100.app, Pearl NX-4988).

---

## 1. Der Zuschnitt in einem Absatz

Eine gewöhnliche Schlüsselbox aus dem Handel verwahrt den KG-Schlüssel. Sie wird mit einem
Zahlencode geöffnet, und **diesen Code kennt der Träger nicht**. Steht eine Öffnung an, die der
Tracker ohnehin schon als erlaubt beurteilt (Sperrzeit vorbei, Reinigungsfenster offen, Freigabe
der Keyholderin), fordert der Tracker bei der Hersteller-Cloud einen **zeitlich befristeten Code**
an und zeigt ihn dem Träger an. Nach dem Fenster ist der Code tot. Die Keyholderin muss nichts
herausgeben und nichts bestätigen; sie stellt die Regeln, wie bisher, und die Box folgt ihnen.

## 2. Warum dieser Weg und nicht die naheliegenden

| Weg | Was er braucht | Warum nicht |
|---|---|---|
| Heimdall-Box | eigene Hardware, MQTT-Gegenstelle, Firmware | funktioniert, ist aber Eigenbau. Wer keine hat, hat gar nichts |
| Fernöffnen über die Hersteller-App | WLAN-Gateway, Cloud erreichbar, Box online | genau das ist bei einem Bluetooth-Safe der wackligste Teil. Tuyas Cloud-APIs für BLE-Schlösser sind laut eigener Doku nicht allgemein verfügbar, und die offizielle Home-Assistant-Integration lässt die Lock-Plattform bewusst weg |
| Bildersafe (versiegeltes Foto) | nichts | funktioniert **heute schon** und deckt den Ritus ab. Aber der Träger stellt den Code selbst ein, und die Freigabe ist ein Bild, kein Vorgang |
| **Code-Box (dieses Konzept)** | ein Cloud-Konto, ein HTTPS-Aufruf | die Box darf offline sein, es braucht kein Gateway und kein Fernöffnen |

Der entscheidende Unterschied zum Fernöffnen: der **Offline-Temporärcode** entsteht allein in der
Cloud, das Schloss prüft ihn lokal per Algorithmus. Es muss dafür nie mit irgendwem gesprochen
haben. Damit fällt die gesamte Funkstrecke aus der Rechnung, und mit ihr der Grund, aus dem die
anderen Wege unsicher sind.

## 3. Das Gerät

Recherchestand vom 22.09.2026, **nicht selbst verifiziert** (die Hersteller-Seiten waren aus der
Arbeitsumgebung nicht erreichbar):

- Xcase Mini-Schlüssel-Safe **SAF-100.app**, Pearl-Artikel **NX-4988**, Bluetooth 4.2, IP54.
- Bedient über die App **ELESION**. Das ist ein White-Label-Tuya; dieselben Geräte erscheinen in
  Smart Life.
- Vierstelliger Code, per App erzeugt, dauerhaft **oder befristet**. Die Befristung gibt es also
  bereits auf App-Ebene, die Frage ist allein, ob die Cloud-API sie für dieses Gerät freigibt.
- Welche Zusammenstellung hinter dem Varianten-Suffix `-3110` steckt (Set mit WLAN-Gateway?), ist
  offen. Für dieses Konzept **egal**: das Gateway wird nicht gebraucht.

Die Bauart ist dünnes Blech. Das ist eine rituelle Schranke, kein Tresor, und für den Zweck
ausreichend: Sicherheit gegen Aufbrechen ist hier nicht das Ziel.

## 4. Die Mechanik

Tuya erzeugt den Code über
`POST /v1.1/devices/{device_id}/door-lock/offline-temp-password`. Ein zweiter Endpunkt listet
diejenigen Schlösser auf, die die Offline-Code-Funktion überhaupt beherrschen; er ist das Go/No-Go
dieses Konzepts. Beide stehen in Tuyas „Password Management APIs" (Quellen unten). Feldnamen und
Signatur-Verfahren sind hier bewusst **nicht** abgeschrieben, sondern beim PoC aus der Doku zu
lesen: eine abgeschriebene Signatur, die niemand ausprobiert hat, ist eine Fehlerquelle mit
Selbstbewusstsein.

## 5. Der PoC, und zwar vor allem anderen

Zwanzig Minuten, kein Code im Repo:

1. Tuya-IoT-Entwicklerkonto anlegen, Cloud-Projekt erstellen, das ELESION-Konto daran koppeln.
2. Den Safe in der Liste der Geräte wiederfinden (Geräte-ID notieren).
3. Die Liste der Schlösser mit Offline-Code-Funktion abrufen. **Taucht der Safe nicht auf, endet
   das Konzept hier.**
4. Einen Code über ein Fenster von fünf Minuten erzeugen, an der Box eintippen, danach noch einmal
   eintippen. Erst das zweite Eintippen beantwortet die eigentliche Frage: läuft der Code wirklich
   ab, ohne dass die Box je Netz hatte?

Erst wenn Schritt 4 sauber durchläuft, lohnt sich Abschnitt 6.

## 6. Einbau, wenn der PoC trägt

**Nicht über Heimdall.** Ein Offline-Code ist kein Hardware-Kommando, sondern ein signierter
HTTPS-Aufruf, und `BoxStatus`/`BoxEvent` erwarten Telemetrie, die es hier nicht gibt. Das passende
Muster im Repo ist `src/lib/vision/`: Provider-Abstraktion, Zugangsdaten aus einer
Admin-Einstellung (verschlüsselt über `secretBox.ts`), `.env` als Rückfall, dazu ein Selbsttest,
der die Einstellung am echten Dienst prüft statt sie nur zu speichern.

- `src/lib/codeBox/` nach diesem Schnitt. `selfTest.ts` holt einen Wegwerf-Code über ein
  Minutenfenster; das ist zugleich Schritt 3+4 aus Abschnitt 5, nur automatisiert.
- **Wann ein Code erscheint**, entscheidet keine neue Regel. Die grund-unabhängige Hälfte steht in
  `boxOpenOutlook.ts`, die grund-abhängige kennt das Öffnen-Formular (`isPermittedCleaningOpening`).
  Eine dritte Herleitung derselben Frage liefe auseinander.
- **Modell** für den ausgegebenen Code: `userId`, Fenster (`validFrom`/`validUntil`), Anlass,
  Aussteller, `revealedAt`, der Code selbst über `sealSecret()`. Eintrag in
  `src/lib/mcp/stateAreas.ts`, sonst meldet `check_updates` „nichts geändert", während der Träger
  einen Code vor sich hat. Aufbewahrung wie beim Posteingang: abgelaufene Codes werden beschnitten.
- **Anzeige** an der Box-Karte des Trägers (`BoxStatusCard`-Nachbar) und in der Keyholder-Sicht.
- **MCP im selben Zweig.** Was die Keyholderin im Browser auslösen kann, muss die KI-Keyholderin
  auslösen können (`CLAUDE.md`, „MCP-Vollständigkeit"). Also ein Werkzeug zum Ausgeben und
  Zurückziehen, und der Zustand in `get_box_state`. Nachgereicht wird es erfahrungsgemäss nicht.
- **`hardwareEnforced` bleibt `false`.** Das Feld sagt „Schlüssel real weggesperrt, vollstreckt";
  das stimmt hier nur, solange niemand den Code kennt, und das ist eine andere Zusage. Die
  schemaVersion-Disziplin verbietet, ein bestehendes Feld umzudeuten. Braucht die Keyholder-Sicht
  eine Unterscheidung, bekommt sie ein eigenes Feld.

## 7. Was dieses Konzept nicht kann

**Ein ausgegebener Code ist nicht zurückrufbar.** Das ist die Kehrseite davon, dass er ohne Netz
gilt: die Box weiss nichts von einem Widerruf. Ein „Zurückziehen" im Tracker blendet ihn nur aus.
Daraus folgt die einzige echte Stellschraube: **kurze Fenster**. Ein Code über vier Stunden ist
vier Stunden lang ein Generalschlüssel.

**Ob der Code benutzt wurde, sieht der Tracker nicht.** Öffnungsprotokolle entstehen erst, wenn das
Gerät Kontakt hat, also mit Gateway oder wenn jemand die App danebenhält. Der telemetriegestützte
Schlüsselnachweis (`boxKeyProof.ts`) greift hier nicht; es bleibt beim Foto.

**Das Konto ist die Durchsetzung.** Liegt die ELESION-Anmeldung beim Träger, ist die ganze
Konstruktion Zierde. Sie gehört der Keyholderin, und der Träger braucht die App nie.

**Tuya-Projektverwaltung ist lästig.** Das Cloud-Projekt eines Entwicklerkontos muss regelmässig
verlängert werden. Für eine Portal-Instanz wäre zu klären, wessen Konto das ist; für Selbsthoster
ist es das eigene.

## 8. Offene Fragen

1. Beherrscht der SAF-100.app Offline-Codes? (Abschnitt 5, Schritt 3.)
2. Wie fein ist das Fenster? Minuten oder nur Stunden? Davon hängt ab, ob sich eine
   Reinigungsöffnung damit abbilden lässt.
3. Wie viele Codes dürfen gleichzeitig gültig sein, und was passiert beim Überlauf?
4. Gilt ein Offline-Code an einem Gerät, das seit der Erzeugung neu gekoppelt wurde?
5. Wem gehören die Zugangsdaten auf einer Portal-Instanz?

## Quellen

- [Generate Offline Temporary Password](https://developer.tuya.com/en/docs/cloud/009bdf7768?id=Kaospm7walgd5)
- [Get a List of Locks with Offline Password Feature](https://developer.tuya.com/en/docs/cloud/8e96ef393a?id=Kaot8mk4tg2zu)
- [Password Management APIs](https://developer.tuya.com/en/docs/cloud/doorlock-api-password?id=Kbe2nztqcoapu)
- [ha-tuya-ble-access](https://github.com/frankhommers/ha-tuya-ble-access) — lokale BLE-Steuerung
  von Tuya-Schlössern, falls der Cloud-Weg scheitert und der lokale geprüft werden soll.
