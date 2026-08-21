# Nachrichten

## Zweck

Der Posteingang — die dauerhafte Spur dessen, was gemeldet wurde. Er ist **nicht** dasselbe wie eine
Benachrichtigung: die Posteingangs-Zeile entsteht unabhängig davon, ob Mail oder Push rausgehen
(siehe [75-benachrichtigungen.md](75-benachrichtigungen.md)).

**Keine Stellschrauben.** Was hier landet, ergibt sich aus den Ereignissen anderer Mechaniken.

## Zwei Kanäle, ein Schlüssel

Jede Zeile hängt am **Sub**, auch die an dessen Keyholder gerichtete. Der Unterschied steckt allein
im Empfängerkreis:

| `audience` | Empfänger | Zeilen |
|---|---|---|
| `sub` | der Träger | eine je Träger |
| `keyholders` | alle seine Keyholder | **eine gemeinsame** |

Dass eine Keyholder-Meldung nur einmal existiert, ist Absicht: der Lesestand hängt am **Leser**, also
hat jeder Keyholder auf derselben Zeile seinen eigenen. Das spart eine Zeile je Empfänger. Die
Kehrseite: **Löschen trifft alle.**

Daraus folgt die harte Regel für jede Abfrage: der Sub-Schlüssel allein trennt die beiden Sichten
nicht — der Empfängerkreis muss immer mitgefiltert werden.

## Absender: Art, nicht Person

Gespeichert wird `system`, `keyholder` oder `ai`. **Welche** Person, kann diese Angabe nicht sagen.

Genau eine Meldung trägt zusätzlich einen Namen: die eines von Hand notierten Vergehens. Hat der
Keyholder es notiert, ist er der Absender — „System" wäre dort schlicht falsch.

Die beiden anderen Zeilen zum selben Vergehen — Strafe verhängt, Vergehen verworfen — **können**
ihren Autor nicht nennen: ihr einziges Autorenfeld enthält ein Kürzel, nie einen Benutzernamen. Wer
geurteilt hat, hält der Tracker nicht fest. Das nachzurüsten heisst, den Handelnden bis ins Urteil
durchzureichen — eine eigene Änderung, keine Erweiterung des Namensfelds.

## Verlinkt statt kopiert — mit einer Ausnahme

Freitexte werden **verlinkt**, damit eine spätere Korrektur rückwirkend richtig wirkt statt zwei
Wahrheiten zu erzeugen.

Der Absendername ist die Ausnahme und wird **kopiert**. Der Grund: er ist unveränderlich (das Modul
kennt Anlegen und Zurückziehen, keinen Umschreib-Pfad), es kann also keine abweichende zweite Fassung
geben. Und die Nachricht ist der Beleg einer **Zustellung** — sie muss wahr bleiben, auch wenn das
Vergehen später zurückgezogen wird. Nachgelesen wäre der Absender dann weg.

## Bekannte Grenze

Der Absender-Filter filtert nach **Art**, nicht nach Namen. Seine Auswahl „Keyholder" trägt den Namen
des einen Keyholders der Seite, während die Zeilen darunter ihren eigenen Autor zeigen. Auf einer
Instanz mit mehreren Admins fällt beides auseinander: die Auswahl nennt eine Person und meint alle.

## Eine Liste, zwei Sichten

Posteingang des Trägers und Posteingang des Keyholders sind **dieselbe** Komponente; der Unterschied
ist ein einziges Merkmal, aus dem sie ihre Endpunkt-Familie ableitet. Ebenso sind die fünf Endpunkte
eines Posteingangs ein Bauplan, kein Dateisatz. Eine dritte Sicht bekommt einen Auflöser, keine fünf
neuen Dateien.

## Code

`messageService.ts`, `messageScope.ts`, `messageInboxRoutes.ts`, `messageBulk.ts`,
`messagePresenter.ts`, `offenseAnnounce.ts`, Modelle `Message` / `MessageRead`.

## Tests

`messageService.test.ts`, `messageActor.test.ts`, `messageCategories.test.ts`,
`adminMessageRoutes.test.ts`, `offenseAnnounce.test.ts`, `offenseDismissedNotice.test.ts`.
