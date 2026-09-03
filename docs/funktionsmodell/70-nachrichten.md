# Nachrichten

## Zweck

Der Posteingang — die dauerhafte Spur dessen, was gemeldet wurde. Er ist **nicht** dasselbe wie eine
Benachrichtigung: die Posteingangs-Zeile entsteht unabhängig davon, ob Mail oder Push rausgehen
(siehe [75-benachrichtigungen.md](75-benachrichtigungen.md)).

**Keine Stellschrauben am Datensatz.** Was hier landet, ergibt sich aus den Ereignissen anderer
Mechaniken. Die einzige Einstellung ist die Aufbewahrung, und sie ist instanzweit (siehe unten).

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

Einen Namen tragen die Meldungen, hinter denen eine Entscheidung eines Menschen steht: das von Hand
notierte Vergehen, die verhängte Strafe und das verworfene Vergehen. Alle drei reichen den
Handelnden an die Schreibstelle durch, und die leitet die Absender-Achse daraus ab — es gibt nur
diesen einen Weg in die Tabelle.

Die reinen Feststellungen bleiben ohne Namen: eine automatisch erkannte Öffnung, eine versäumte
Kontrolle, eine ausgelaufene Frist. Dahinter steht niemand, und „System" ist dort die richtige
Angabe, keine Notlösung.

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
ist ein einziges Merkmal, aus dem sie ihre Endpunkt-Familie ableitet. Ebenso sind die Endpunkte
eines Posteingangs ein Bauplan, kein Dateisatz. Eine dritte Sicht bekommt einen Auflöser, keine
neuen Dateien.

## Aufbewahrung

Einmal täglich löscht der Poller **gelesene** Meldungen jenseits der Frist — Vorgabe ein Jahr, über
`MESSAGE_RETENTION_DAYS` einstellbar, `0` schaltet es ab. Je Lauf begrenzt; über die Tage holt es auf.

**Ungelesene Meldungen bleiben liegen, egal wie alt.** Eine Zustellung, die nie ein Mensch gesehen
hat, ist kein Altpapier — sie stillschweigend zu löschen hiesse, dass sie folgenlos verschwindet.

Die Frist hängt damit am **Zustand**, nicht nur am Alter. Das ist der Platz, an dem eine offene Bitte
des Trägers (Aufschluss, Orgasmus) später ausgenommen wird: auch eine gelesene Bitte ist kein
Altpapier, solange sie unbeantwortet ist.

## Code

`messageService.ts`, `messageScope.ts`, `messageInboxRoutes.ts`, `messageBulk.ts`,
`messagePresenter.ts`, `offenseAnnounce.ts`, Modelle `Message` / `MessageRead`.

## Tests

`messageService.test.ts`, `messageActor.test.ts`, `messageCategories.test.ts`,
`adminMessageRoutes.test.ts`, `offenseAnnounce.test.ts`, `offenseDismissedNotice.test.ts`.
