# Verworfen: Wiegungen über eine Schnittstelle melden

**Gebaut am 24.08.2026 (v5.3.9), am selben Tag wieder entfernt.** Dieses Papier bleibt, damit die
Idee nicht in einem halben Jahr ein zweites Mal gebaut wird.

---

## Was es war

Ein Endpunkt `/api/integration/weight`, den ein iOS-Kurzbefehl ansprechen konnte: er las das Gewicht
aus Apple Health und schickte es samt Messzeitpunkt an den Tracker. Zugang über ein Token je Träger,
abgeleitet aus einem Instanz-Secret. Solche Zeilen kamen ohne Foto und waren als eigene Quelle
gekennzeichnet.

**Der Anlass war ein echtes Problem:** viele Waagen zeigen zuerst das Gewicht und danach BMI,
Körperfett und den Rest. Den Moment fürs Beleg-Foto zu erwischen ist mühsam, und wer daneben trifft,
fotografiert eine Zahl, die nicht sein Gewicht ist — die Erkennung liest dann diese, der Träger
korrigiert von Hand, und in der Liste steht eine Warnung, als hätte er geschummelt.

## Warum es weg ist

**Der Endpunkt kann nicht unterscheiden, ob eine Zahl von einer Waage kommt oder getippt wurde.**
Der Kurzbefehl läuft auf dem Handy des Trägers und lässt sich ändern; auch der Umweg über Apple
Health hilft nicht, denn dort kann man von Hand eintragen. Beim ersten Versuch fiel genau das auf —
der Test-Kurzbefehl fragte nach einer Zahl, und die ging als „von der Waage gemeldet" durch.

Damit stand das Feature vor einer Wahl, die es nicht gewinnen konnte:

- **Als Beleg** taugt es nicht. Es behauptet eine Herkunft, die niemand geprüft hat — und die
  Keyholderin trifft ihre Entscheidungen auf dieser Behauptung
- **Ehrlich beschriftet** („über die Schnittstelle gemeldet, ohne Beleg") wäre es ein zweiter
  Erfassungsweg ohne Nachweis, neben einem ersten mit Nachweis. Der Aufwand dafür — Endpunkt,
  Token-Ableitung, Instanz-Secret, Anleitung, eine vierte Quelle im Datenmodell — steht in keinem
  Verhältnis zu „man spart sich ein Foto"

Entscheidung von trublue am 24.08.2026, nach dem ersten Praxistest.

## Was stattdessen zu tun wäre

Das Ausgangsproblem ist damit NICHT gelöst und bleibt offen: **das Beleg-Foto scheitert am Timing
der Waagen-Anzeige.** Der naheliegende Weg dorthin führt nicht über eine neue Schnittstelle, sondern
über die Erkennung selbst — sie sollte `detectedKg` nur setzen, wenn die gelesene Zahl überhaupt ein
plausibles Körpergewicht ist und nicht absurd weit von der letzten Messung entfernt liegt. Ein
erwischter BMI-Bildschirm gilt dann als „nicht lesbar" statt als Widerspruch: keine Warnfarbe, kein
Schummel-Verdacht, und der Träger trägt die Zahl von Hand nach wie bisher.

## Wenn es doch je wiederkommt

Dann nur mit einer Antwort auf die Frage, die es hier zu Fall gebracht hat: **woran erkennt der
Tracker, dass eine Zahl wirklich von einer Waage stammt?** Ohne diese Antwort ist jeder solche
Endpunkt eine Selbstauskunft mit technischem Anstrich — und die gibt es einfacher, nämlich über das
Formular.
