# Vorrang- und Kollisionsregeln

Was gewinnt, wenn zwei Regeln gleichzeitig gelten. Fast alles hier ist einzeln richtig und wird erst
im Zusammenspiel überraschend — genau die Fälle, die im Betrieb als „unlogisch" auffallen.

Jede Zeile hier ist eine reale Beobachtung oder eine Stelle, an der der Code eine bewusste
Entscheidung gegen die naheliegende trifft. Neue Überraschungen gehören hierher, sobald sie
verstanden sind.

## Erlaubnis-Ketten (etwas ist erlaubt, passiert aber nicht)

**Reinigung braucht zwei Ja.** `User.reinigungErlaubt` **und** `reinigungErlaubt` der Sperrzeit.
Bei mehreren aktiven Sperrzeiten müssen **alle** erlauben — die UND-Regel in
`foldActiveSperrzeiten`, nicht die neueste Zeile.

**Zeitfenster binden nur unter Sperrzeit.** Ein gesetztes Reinigungsfenster tut ausserhalb einer
aktiven, reinigungserlaubenden Sperrzeit gar nichts. Wer „nur zwischen 19 und 20 Uhr" durchsetzen
will und keine Sperrzeit laufen hat, hat nichts durchgesetzt.

**Leere Fensterliste ist kein Verbot**, sondern „nicht an eine Tageszeit gebunden". Verboten wird
mit `reinigungErlaubt: false`.

**Ein Fenster wrappt nicht über Mitternacht.** `22:00–06:00` als ein Eintrag ist ungültig; es
braucht zwei.

**Eskalationsstufe 2 ohne Stufe 1 feuert nie.** Der Stempel der Mahnung ist der Uhr-Anker, ab dem
Stufe 2 zählt. Nur Stufe 2 einzuschalten ergibt eine Einstellung, die nichts tut.

**`perDayMax: 0` schaltet nicht alles ab.** Es nimmt den Tagesplan weg; die Kontrolle nach dem
Wiederverschluss bleibt. Alles abschalten tut nur `autoKontrolleAktiv: false`.

## Auslöser, die nicht auslösen

**Ein vom Keyholder nachgetragener Verschluss löst keine Reinigungs-Kontrolle aus.** Nur der
Selbst-Erfassungspfad des Subs tut das. Grund: der Planer rechnet ab *jetzt*, nicht ab `startTime` —
ein um 23:00 nachgetragener Verschluss von 14:00 plante sonst eine Kontrolle „in 15–45 Minuten".

**`autoKontrolleNurBeiSperre` gilt nicht für die Reinigungs-Kontrolle.** Die hängt allein am
Hauptschalter. Wer den Tagesplan auf Sperrzeiten begrenzt, bekommt trotzdem nach jedem
Wiederverschluss eine.

**Eine terminierte Direktive existiert vor `wirksamAb` nicht.** Keine Anzeige, keine Meldung, keine
laufende Frist. Sie fehlt deshalb auch in „offene Direktiven"-Ansichten — das ist kein Datenverlust.

## Fristen und Nullpunkte

**`dauerH` gegen `sperrEndetAt`.** Mindest-Tragedauer ab dem tatsächlichen Verschluss gegen feste
Wanduhr. Ein später Verschluss verschiebt die eine mit und verkürzt die andere. Wer eine Tragedauer
meint und ein festes Ende setzt, gibt nachweislich weniger, als er gesagt hat.

**Aufgaben: `holdUntilAt` gegen `holdMinutesFromStart`.** Dieselbe Falle. Bei festem Ende geht die
Kulanzfrist von der Tragezeit ab; wer sofort anlegt, trägt länger als wer sich Zeit lässt.

**Stufe 2 zählt ab Stufe 1**, nicht ab der Kontroll-Frist. Die effektive Gesamtverzögerung ist die
Summe beider Verzögerungen.

## Erkannt ≠ durchgesetzt

**Das Reinigungs-Tageskontingent wird nur erkannt.** `reinigungMaxProTag` verhindert keine Öffnung;
es erzeugt ein Vergehen. Die Ahndung ist Sache des Keyholders.

**Ein Bild-gegen-Deklaration-Konflikt ist kein Vergehen.** „Falsches Gerät" entsteht ausschliesslich
aus einer Anforderung, die ein bestimmtes Gerät verlangt.

**Erkannte Vergehen sind keine Strafen.** Bestraft ist nur, was der Keyholder bestraft hat.

## Zustände, die nach Fehlern aussehen

**Kein eigener Gerätewechsel.** Ein Wechsel läuft über eine Reinigungsöffnung — er verbraucht also
das Tageskontingent und ist während einer Sperre nur zulässig, wenn sie die Reinigung erlaubt.

**Eine Reinigungspause bricht die Session nicht.** Sie zerlegt sie in Segmente und wird von der
Tragedauer abgezogen. Ein Gerätewechsel erst recht nicht.

**Eine Inventar-Kategorie liefert per Design keine Sessions.** `trackingEnabled: false` — Abwesenheit
in den Auswertungen ist dort keine Nichtnutzung.

**Box-Failsafes öffnen auch gegen eine laufende Sperrzeit** (leerer Akku, zu lange offline,
absolutes Hard-Cap). Der Tracker-Zustand ändert sich dadurch nicht — Sperrzeit und Box können
auseinanderlaufen.

## Zeitrechnung

**Alle Tages-Regeln rechnen in der Zeitzone des Subs**, nicht der des Servers: Kalendertag des
Reinigungskontingents, Reinigungsfenster, Schlaf-Fenster, festes Auslöse-Fenster.

**Die Zeitachse des Tagesplans hängt am Wach-Beginn**, nicht an Mitternacht — sonst verschöbe sich
das ganze Fenster an den Umstellungstagen um eine Stunde.

## Historisierte Regeln

**Reinigungs- und Vergehensregeln sind Historien, keine Schalter.** Jede Tat wird nach der Fassung
beurteilt, die zu ihrem Zeitpunkt galt. Eine heute abgeschaltete Vergehensart kann weiterhin ältere
Vergehen zeigen.

**Die Historie beginnt je Sub erst mit seiner ersten Änderung nach dem Update.** Davor gilt
rückwirkend der damalige Stand als „seit jeher" (`effectiveFrom = Epoch`).

**Ein Speichern ohne Wertänderung schreibt keine Zeile.** Sonst nennte `changedBy` irgendwann den,
der zuletzt bestätigt hat.

## Fristen, die früher zuschlagen als erwartet

**Die eigene Frist eines Nachweises versäumt die GANZE Aufgabe** — sofort, nicht erst am Ende.
Danach nimmt die App für diesen Nachweis auch nichts mehr an.

**Ein Enddatum eines Trainingsziels wandert von selbst**, wenn `validUntilManual` fehlt: die
automatische Verkettung setzt es auf den Beginn des Folgeziels. Ein von Hand gesetztes Ende
verschwindet dann scheinbar grundlos.

**Bedingungen, Nachweise und die Reihenfolge-Regel einer Aufgabe sind nach dem Stellen nicht mehr
änderbar.** Andere wollen heisst zurückziehen und neu stellen. Ein Zurückziehen wird nie ein
Vergehen.

## Was ein Rückzug mitnimmt

**Eine zurückgezogene Sperrzeit tilgt die daran hängenden Vergehen** — sie sind live abgeleitet und
existieren ohne die Sperre nicht mehr. Einzige Ausnahme ist `admin_password_change`: er wird im
Moment des Vorgangs festgeschrieben, genau deshalb.

**Eine Regeländerung schreibt die Vergangenheit nicht um.** Eine heute abgeschaltete Vergehensart
kann weiterhin ältere Vergehen zeigen. Das ist richtig, nicht kaputt.

**Alte Vergehen werden nie gemeldet.** Abgeleitete Vergehen mit einer Tatzeit vor dem Stichtag der
Instanz erreichen den Träger nicht — sonst kippte der erste Lauf nach einem Update seine ganze
Historie in den Posteingang. Von Hand notierte sind ausgenommen.

## Leere Listen, die keine Leere bedeuten

**Ein Admin-Konto ohne Zuordnung sieht überall leere Listen**, nicht alle Subs. Die Zuordnung
Keyholder ↔ Sub ist die eigentliche Berechtigung — fehlt sie, ist jede beziehungsbasierte Sicht
leer, obwohl das Konto Admin-Rechte hat.

**Eine Inventar-Kategorie liefert per Design keine Sessions.** Abwesenheit in den Auswertungen ist
dort keine Nichtnutzung.

**Eine leere Failsafe-Warnliste der Box ist kein Freibrief.** Sie heisst auch: nie gemeldet,
Schwellen unbekannt. Und vor der Funkstille kann die Box nicht warnen — eine Box ohne Netz meldet
auch ihre Funkstille nicht.

**Eine überfällige Kontrolle verschwindet nie.** Eine leere Kontroll-Liste heisst „gerade keine
offen", nicht „ausgelaufen".

## Stille, die keine Abwesenheit ist

**Alle Benachrichtigungs-Kanäle aus heisst nicht: keine Meldung.** Die Posteingangs-Zeile entsteht
unabhängig vom Versand. Und umgekehrt stoppt eine nicht zugestellte Mahnung die Eskalation nicht —
der Stempel wird gesetzt, egal ob sie ankommt.

**Löschen einer Keyholder-Nachricht trifft alle Keyholder.** Es gibt nur eine Zeile je Träger; die
Empfänger teilen sie sich und haben darauf nur ihren eigenen Lesestand.

**Der Absender-Filter des Posteingangs filtert nach Art, nicht nach Person.** Auf einer Instanz mit
mehreren Admins nennt seine Auswahl eine Person und meint alle.

**Die MCP-Werkzeugliste ist pro Verbindung gecacht.** Ein neuer Chat genügt nicht, um geänderte
Werkzeuge zu sehen — es braucht eine frische Verbindung.

## Einstellungen mit Rückwirkung

**Ein Lookalike-Cluster zu setzen rechnet die Geräte-Zuordnung jeder historischen Session mit
Bild-Konflikt neu.** Die einzige Geräte-Einstellung, die rückwirkt — vorher die Vorschau prüfen.

## Box: Soll ist nicht Ist

**`locked` ist das Soll, `reportedLocked` das Ist.** Seit dem Präsenz-Guard können sie
auseinanderfallen: die Box kann offen stehen, obwohl sie zu sein soll. Wer nur das Soll liest, sieht
das nicht.

**Eine verbotene Öffnung bekommt gar kein Box-Kommando** — sonst vollzöge der Tracker das Vergehen,
das er dokumentiert.

**Der Schlüssel muss nicht in der Box sein.** Erklärt der Sub beim Verschluss das Gegenteil, bekommt
die Box bewusst kein Sperr-Kommando; die Sperrzeit läuft trotzdem, nur ohne physische Durchsetzung.

## Offene Frage

**Die Zeitzone ist ein Sub-Feld, steuert aber Keyholder-Regeln.** `User.timezone` lässt sich vom Sub
selbst ändern (`/api/settings/timezone`, normale Session-Auth — als Anzeige-/Eingabefeld eingestuft).
Sie bestimmt aber, wann Reinigungsfenster und Schlaf-Fenster greifen und wann der Kalendertag des
Reinigungskontingents umschlägt. Eine Zeitzonen-Änderung verschiebt damit Regeln, die der Keyholder
gesetzt hat.

Ob das gewollt ist, ist eine Produktentscheidung, keine technische: eine Zone, die der Sub nicht
ändern kann, wäre für Reisende falsch. Hier steht es, damit es eine Entscheidung ist und keine
Überraschung.
