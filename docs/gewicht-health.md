# Die Waage meldet selbst: Wiegungen aus Apple Health

**Status:** gebaut (24.08.2026) · **Setzt voraus:** `docs/gewicht-konzept.md`

---

## 1. Das Problem, aus dem es entstand

Der Beleg einer Wiegung ist ein Foto der Waagen-Anzeige. Viele Waagen zeigen aber zuerst das
Gewicht und danach BMI, Körperfett und den Rest — den richtigen Moment zu erwischen ist mühsam,
und wer daneben trifft, fotografiert eine Zahl, die nicht sein Gewicht ist. Die Waagen-Erkennung
liest dann diese Zahl, der Träger korrigiert von Hand, und in der Liste steht „getippt 74,1 ·
gelesen 22,8" in Warnfarbe: **genau die Anzeige, die eine Schummelei sichtbar machen soll, feuert
ohne Anlass.**

## 2. Der Weg: Kurzbefehl statt Bluetooth

Die Waage direkt anzusprechen wäre der falsche Aufwand — Web Bluetooth gibt es auf iOS nicht, jedes
Modell spricht sein eigenes Protokoll, und die Hersteller ändern es ohne Ankündigung. Ein natives
HealthKit-Plugin wiederum kostet einen App-Umbau samt neuem TestFlight-Build und liesse Android
aussen vor.

Stattdessen: **ein iOS-Kurzbefehl liest den Wert aus Apple Health und schickt ihn an den Tracker.**
Kein App-Umbau, keine Waagen-Protokolle — es funktioniert mit jeder Waage, die nach Health schreibt,
und das tun praktisch alle über ihre eigene App.

Auf der Tracker-Seite ist es eine Route nach dem Muster der Heimdall-Anbindung
(`/api/integration/box/event`): Bearer-Token, Zuordnung per Benutzername, sonst nichts.

## 3. Der Zugang: ein Token je Träger

`src/lib/healthIngest.ts`. Die Box nebenan kommt mit EINEM Instanz-Secret aus, weil dort ein Server
spricht, den der Betreiber betreibt. Hier liegt der Zugang auf dem **Handy des Trägers** — mit einem
gemeinsamen Secret könnte jeder Träger Werte für jeden anderen der Instanz schreiben.

Das Token ist deshalb ein HMAC über seinen Benutzernamen: pro Person verschieden, ohne Spalte, ohne
Ausgabe-Verwaltung. Er findet es in seinen Einstellungen unter „Zugang für die Waage".

**Was das nicht kann: einzeln widerrufen.** Wer ein Token zurücknehmen will, dreht
`HEALTH_INGEST_SECRET` — dann sind alle neu. Vertretbar, weil der Token ausschliesslich Gewichte für
genau eine Person schreibt, und die kann sie ohnehin selbst eintippen. Wäre er je mehr wert, gehört
er in eine Tabelle mit Ablauf und Rückruf.

**Ohne `HEALTH_INGEST_SECRET` gibt es den Zugang auf einer Instanz nicht** — die Route antwortet
404, nicht 401: ein Scanner soll nicht einmal erfahren, dass es sie gäbe.

## 4. Was der Kurzbefehl tut

```
POST https://<instanz>/api/integration/weight
Authorization: Bearer <Token aus den Einstellungen>
Content-Type: application/json

{ "username": "…", "weightKg": 74.1, "measuredAt": "2026-08-24T06:32:00Z" }
```

**Der Zeitpunkt gehört mit.** Ohne ihn landet eine Messung von heute früh unter der Uhrzeit des
Kurzbefehls — und damit womöglich ausserhalb der Wiege-Fenster, wo sie nicht in den Trend zählt.

Die Antwort trägt `replaced` (stand für den Tag schon ein Wert?) und `released` (hat die
Freigabe-Vorgabe damit gegriffen?), sodass der Kurzbefehl eine Mitteilung anzeigen kann, ohne dass
jemand die App öffnet.

**Als Auslöser** taugt alles, was Kurzbefehle hergeben: ein Tipp auf dem Home-Screen, eine feste
Uhrzeit, ein NFC-Aufkleber neben der Waage. Ob „neuer Wert in Health" als Automation zur Verfügung
steht, hängt an der iOS-Version und ist am Gerät auszuprobieren.

## 5. Der Beleg — die eigentliche Entscheidung

Ein Wert aus Health ist **kein Nachweis**: in Health lässt sich von Hand eintragen. Der Aufwand ist
höher als beim Tippen, aber es bleibt ungeprüft. Damit stand die Frage, was aus der Beleg-Pflicht
wird. Entschieden am 24.08.2026 von trublue: **nicht verbieten, sondern kennzeichnen.**

- Die Zeile trägt `source: "health"` — ein viertes neben `user`, `keyholder`, `agent`
- **Keine Foto-Pflicht** für diese Quelle. Ein Foto von dem Gerät zu verlangen, das den Wert gerade
  gemeldet hat, wäre ein Beleg für den Beleg
- **Dafür steht die Quelle überall:** ein eigenes Zeichen in der Zeile, „Von der Waage gemeldet
  (Apple Health)" im Detail-Panel, `source` in `weight_history` für die KI

Die Keyholderin sieht damit auf einen Blick, welche Werte einen Beleg tragen und welche nicht — und
entscheidet selbst, ob ihr das reicht oder ob sie gelegentlich doch ein Foto verlangt. Das ist die
Linie des ganzen Features: Transparenz statt Verbot.

## 6. Was bewusst offen bleibt

- **Android.** Health Connect kann dasselbe, es fehlt nur die Automation. Wer dort etwas
  Gleichwertiges hat (Tasker, HTTP Shortcuts), spricht denselben Endpunkt an — er ist nicht
  iOS-spezifisch, nur die Anleitung ist es
- **Kein Import der Vergangenheit.** Der Kurzbefehl meldet einen Wert, keine Historie. Ein
  Rückwärts-Import wäre eine andere Sache: er schriebe Tage um, an denen die Meldepflicht bereits
  geurteilt hat
- **Körperfett, Muskelmasse, BMI** wandern nicht mit. Der Tracker führt ein Gewicht und rechnet den
  BMI aus der Grösse; weitere Werte wären neue Spalten und neue Anzeigen, ohne dass heute jemand
  danach gefragt hat
