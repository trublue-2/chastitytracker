# Funktionskatalog

<!-- GENERIERT — nicht von Hand ändern. Quelle: src/lib/funktionsmodellCapabilities.ts
     neu erzeugen: `npm run funktionsmodell` -->

Was der Tracker kann — flach aufgelistet, nach Mechanik gruppiert. Für den Betrieb, nicht für
Endnutzer: die Spalte **Endpunkt** nennt die API-Route bzw. das MCP-Werkzeug dahinter.

97 Funktionen über 18 Mechaniken, davon 12 ohne jede Bedienung — sie laufen von selbst.

**Wer** ist der Auslöser, **Wo** die Oberfläche. Eine Funktion mit zwei Oberflächen ist EINE
Funktion: „Kontrolle anfordern" gibt es in der App und über den MCP, und beide Wege enden im
selben Vorgang — sie können also nicht auseinanderlaufen.

Vollständigkeit ist geprüft, nicht behauptet: jede API-Route und jedes MCP-Werkzeug muss hier
beansprucht oder ausdrücklich ausgenommen sein, sonst schlägt `npm test` fehl. Die Funktionen
ohne Endpunkt (Spalte „—") entziehen sich dieser Prüfung — für sie ist diese Liste die einzige.

## Einträge

Steckbrief: [15-eintraege.md](15-eintraege.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Ereignis erfassen** | Verschluss, Öffnen, Prüfung, Orgasmus oder Trage-Beginn/-Ende mit Zeitpunkt, Foto und Notiz anlegen. Der Vorgang, aus dem fast alles andere abgeleitet wird. <br>*Rückdatieren ist auf diesem Weg begrenzt — sonst datierte sich der Träger aus jeder Frist heraus.* | Sub | App (Träger) | `/api/entries` |
| **Eigenen Eintrag ändern oder löschen** | Korrigiert einen bereits erfassten Eintrag; alle abgeleiteten Zustände folgen automatisch. | Sub | App (Träger) | `/api/entries/[id]` |
| **Eintrag für einen Sub nachtragen** | Legt einen Eintrag im Namen des Trägers an — hier ist Rückdatieren erlaubt. <br>*Löst bewusst KEINE Reinigungs-Kontrolle aus: der Planer rechnet ab jetzt, nicht ab der Eintrags-Zeit.* | Keyholder (UI) | App (Keyholder) | `/api/admin/entries` |
| **Fremden Eintrag ändern** | Korrigiert den Eintrag eines Trägers. | Keyholder (UI) | App (Keyholder) | `/api/admin/entries/[id]` |
| **Roh-Einträge lesen** | Die unaufbereitete Eintragsliste für die Keyholder-KI. | Keyholder (MCP) | MCP | `list_entries` |
| **Foto hochladen und ausliefern** | Nimmt Bilder entgegen (Endungs-Whitelist, Magic-Byte-Prüfung, Grössenlimit) und liefert sie nur authentifiziert wieder aus. | Sub, Keyholder (UI) | App (Träger), App (Keyholder) | `/api/upload` `/api/uploads/[...path]` |
| **Bild an die Keyholder-KI geben** | Liefert ein hinterlegtes Foto an den MCP, damit die KI es selbst ansehen kann. | Keyholder (MCP) | MCP | `get_image` |
| **Demo-Daten anlegen** | Erzeugt einen Beispiel-Träger mit Beispiel-Einträgen. <br>*Nur erreichbar, wenn ausdrücklich per Umgebungsvariable freigeschaltet — sonst 404.* | Keyholder (UI) | App (Keyholder) | `/api/admin/demo` |

## Sessions/Statistik

Steckbrief: [15-eintraege.md](15-eintraege.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Auswertungen lesen** | Session mit Segmenten und Geräte-Aufschlüsselung, Geräte-Statistik, Rekorde, Perioden-Zusammenfassung, Enthaltsamkeits-Trend und Zeitleiste. | Keyholder (MCP) | MCP | `get_session` `device_stats` `records` `period_summary` `denial_trend` `timeline` |
| **Statistik-Seiten** | Kalender, Monatsübersicht und Zielerreichung — dieselbe Ansicht für den Träger und für den Keyholder. <br>*Server-Komponente ohne eigene Route.* | Sub, Keyholder (UI) | App (Träger), App (Keyholder) | — |

## Sperrzeit

Steckbrief: [10-sperrzeit.md](10-sperrzeit.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Einschliessen anfordern** | Fordert den Träger auf, sich bis zu einem Zeitpunkt einzuschliessen — wahlweise mit Mindest-Tragedauer oder festem Sperr-Ende. <br>*Mehrere dürfen offen sein; EIN Verschluss erfüllt alle, und die strengste Sperrzeit setzt sich durch.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/verschluss-anforderung` `request_lock` |
| **Anforderung ändern** | Verschiebt Frist, Dauer oder Zielgerät einer offenen Einschliess-Anforderung. | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/verschluss-anforderung/[id]` `edit_lock_request` |
| **Sperrzeit setzen** | Ordnet unmittelbar eine Sperrzeit an — befristet oder unbefristet, wahlweise mit Reinigungserlaubnis. <br>*Läuft über dieselbe Route wie die Anforderung; die Box hält daraufhin den Schlüssel fest.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `set_lock_period` |
| **Sperrzeit ändern** | Verlängert, verkürzt oder öffnet die Reinigung einer laufenden Sperrzeit. | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `edit_lock_period` |
| **Direktive zurückziehen** | Nimmt eine Sperrzeit, Anforderung, Kontrolle, Orgasmus-Direktive, Aufgabe oder ein notiertes Vergehen zurück. <br>*Ein Rückzug wird nie ein Vergehen. Bei Kontrollen gezielt per id, sonst trifft er auch ungesehene.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `withdraw` |

## Reinigung

Steckbrief: [20-reinigung.md](20-reinigung.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Reinigungs-Regeln setzen** | Erlaubnis, Höchstdauer je Pause, Anzahl pro Tag und die Tages-Zeitfenster. <br>*Historisiert: jede Öffnung wird nach der Fassung ihrer Zeit beurteilt. Die Fensterliste wird als Ganzes ersetzt.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/users/[id]` `set_cleaning` |
| **Zur Reinigung öffnen** | Eine Öffnung mit dem Grund REINIGUNG — sie bricht die Sperrzeit nicht, sofern alle drei Bedingungen erfüllt sind. <br>*Zugleich der einzige Weg zum Gerätewechsel; verbraucht dessen Tageskontingent.* | Sub | App (Träger) | — |

## Kontrollen

Steckbrief: [30-kontrollen.md](30-kontrollen.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Kontrolle anfordern** | Verlangt ein Beweisfoto — vom Keuschheitsgürtel, von einer Trage-Kategorie oder von genau einem Gerät. <br>*Je Ziel darf nur eine laufen; eine zweite auf dasselbe Ziel wird abgelehnt.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/kontrolle` `request_inspection` |
| **Mögliche Kontroll-Ziele abfragen** | Nennt die Kategorien und Geräte, auf die gerade eine Kontrolle gestellt werden kann. | Keyholder (UI) | App (Keyholder) | `/api/admin/inspection-targets` |
| **Kontroll-Verlauf einsehen** | Alle Kontrollen eines Trägers mit Status, Frist und dem erfüllenden Eintrag. | Keyholder (UI) | App (Keyholder) | `/api/admin/kontrollen` |
| **Kontrolle zurückziehen oder von Hand bestätigen** | Nimmt eine Kontrolle zurück oder erkennt ein Foto an, das die automatische Prüfung nicht bestätigen konnte. | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/kontrollen/[id]` `resolve_inspection` |
| **Kontrolle erfüllen** | Der Träger reicht das Foto ein — bei einem Gerät mit Code-Pflicht mit handschriftlichem Code im Bild. <br>*Erfüllt wird nur die Kontrolle desselben Ziels.* | Sub | App (Träger) | — |
| **Code im Foto erkennen** | Liest den handschriftlichen Kontroll-Code aus dem Bild und vergleicht ihn mit dem geforderten. <br>*Bei fehlgeschlagener Erkennung entsteht ein Grund-Code, kein stilles Scheitern.* | System | läuft von selbst | `/api/verify-kontrolle` |
| **Kontroll-Code erneut zustellen** | Schickt den Code einer offenen Kontrolle noch einmal als Push. | Sub | App (Träger) | `/api/kontrollen/code-push` `/api/kontrollen/[id]/code-push` |
| **Überfällige Kontrolle eskalieren** | Stufe 1 mahnt, Stufe 2 bucht die Öffnung bzw. das Ablegen selbst. <br>*Stufe 2 zählt ab dem Stempel von Stufe 1 — ohne Stufe 1 feuert sie nie. Eine Sperrzeit hebt sie nicht auf.* | System | läuft von selbst | — |
| **Eskalations-Stufen einstellen** | Ob und nach welcher Zeit gemahnt und die Abnahme gebucht wird. <br>*Zwei Stufen, eine Kette: die Mahnung ohne den Vermerk ist eine Erinnerung, der Vermerk ohne die Mahnung eine Falle.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/users/[id]` `set_inspection_escalation` |

## Auto-Kontrollen

Steckbrief: [30-kontrollen.md](30-kontrollen.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Automatische Kontrollen einstellen** | Hauptschalter, Anzahl pro Tag, Schlaf-Fenster, Fristspanne, festes Auslöse-Fenster und die Beschränkung auf Sperrzeiten. | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/users/[id]` `set_auto_inspections` |
| **Tagesplan würfeln und zustellen** | Zieht zur Mitternacht des Trägers eine Anzahl aus der Spanne, verteilt die Kontrollen überlappungsfrei über das Wach-Fenster und stellt sie bei Fälligkeit zu. <br>*Weder Auslösung noch Frist landen je im Schlaf-Fenster; reicht die Mindestfrist nicht, entfällt der Slot.* | System | läuft von selbst | — |
| **Kontrolle nach dem Wiederverschluss** | Nach jedem selbst erfassten Wiederverschluss aus einer Reinigungspause folgt selbsttätig eine Kontrolle. <br>*Feste Regel, keine Einstellung — nur der Hauptschalter der Automatik schaltet sie ab.* | System | läuft von selbst | — |

## Orgasmus

Steckbrief: [35-orgasmus.md](35-orgasmus.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Orgasmus-Fenster stellen** | Ein Zeitfenster als Pflicht (Anweisung) oder Erlaubnis (Gelegenheit), wahlweise mit vorgegebener Art und Öffnungserlaubnis. <br>*Es ist immer nur EINE Direktive aktiv; die Erfüllung passiert automatisch beim passenden Eintrag.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/orgasmus-anforderung` `request_orgasm` |
| **Orgasmus-Fenster zurückziehen** | Nimmt eine offene Direktive zurück. Die Route kennt nur diese eine Aktion. <br>*ÄNDERN gibt es für diese Direktive nirgends — weder in der App noch über den MCP. Anders wollen heisst zurückziehen und neu stellen; als einzige Direktive fehlt ihr das Gegenstück zu `edit_lock_period`, `edit_task` und `edit_training_goal`.* | Keyholder (UI) | App (Keyholder) | `/api/admin/orgasmus-anforderung/[id]` |

## Aufgaben

Steckbrief: [40-aufgaben.md](40-aufgaben.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Aufgabe stellen** | Text plus beliebig viele durchgehend zu haltende Bedingungen und Nachweis-Fotos, mit festem Ende oder als Haltedauer ab dem Anlegen. <br>*Meint man eine Tragezeit, ist die Haltedauer die richtige Form — bei festem Ende geht die Kulanzfrist davon ab.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/tasks` `create_task` |
| **Aufgabe ändern oder zurückziehen** | Verschiebt Frist und Text. <br>*Bedingungen, Nachweise und die Reihenfolge-Regel sind NICHT änderbar — sonst würde der Träger an etwas gemessen, das er nie bekam.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/tasks/[id]` `edit_task` |
| **Aufgabe als erledigt melden** | Die Selbstmeldung des Trägers — bei Aufgaben mit Bedingungen zusätzlich zur Erfüllung nötig, ohne Bedingungen ist sie die Erfüllung. <br>*Bei Bedingungen erst nach Ablauf der Haltefrist möglich.* | Sub | App (Träger) | `/api/tasks/[id]` |
| **Nachweis einreichen** | Lädt ein Nachweis-Foto zu einer Aufgabe hoch. <br>*Massgeblich ist die Aufnahmezeit, nicht die Upload-Zeit.* | Sub | App (Träger) | `/api/tasks/proofs/[id]` |
| **Nachweis sichten** | Nimmt einen Nachweis an oder lehnt ihn ab — der einzige Ausweg aus dem Wartezustand. <br>*Eine Annahme heilt Verspätung, fehlende Aufnahmezeit und falsche Reihenfolge gleichermassen.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/tasks/proofs/[id]` `review_task_proof` |
| **Aufgaben auswerten und melden** | Leitet den Zustand jeder Aufgabe aus den Einträgen ab, stellt terminierte zu und meldet das Ergebnis an beide Seiten. <br>*Nichts daran ist gestempelt — ein nachgetragener Eintrag korrigiert die Aufgabe von selbst.* | System | läuft von selbst | — |

## Trainingsziele

Steckbrief: [45-trainingsziele.md](45-trainingsziele.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Trainingsziel setzen** | Mindest-Tragestunden je Tag, Woche, Monat und Jahr für eine Kategorie und einen Zeitraum. | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/vorgaben` `set_training_goal` |
| **Trainingsziel ändern oder löschen** | Ändert Zeitraum und Vorgaben; das Löschen ist ein Soft-Delete, die Zeile bleibt für die Historie. <br>*Ohne ausdrücklich gesetztes Enddatum überschreibt die automatische Verkettung es.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/vorgaben/[id]` `edit_training_goal` `delete_training_goal` |
| **Trainingsziele lesen** | Die Ziele eines Trägers samt gelöschter, wenn ausdrücklich verlangt. | Keyholder (MCP) | MCP | `list_training_goals` |

## Strafbuch

Steckbrief: [50-strafbuch.md](50-strafbuch.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Vergehen einsehen** | Die erkannten Vergehen mit Urteilsstand — dreizehn Arten, die meisten live aus den Einträgen abgeleitet. | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `get_offenses` |
| **Vergehen von Hand notieren** | Hält fest, was der Tracker nicht sehen kann — gebrochene Abmachung, Unhöflichkeit. <br>*Notieren ist noch kein Urteil. Ein Rückzug nimmt es aus dem Strafbuch, lässt es aber nachlesbar.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/offense` `record_offense` |
| **Urteilen** | Verwerfen, bestrafen (Freitext oder als gestellte Aufgabe), erledigen oder wieder aufnehmen. <br>*Es gibt keine automatische Strafe und keinen Straftypen-Zoo. Eine erfüllte Strafaufgabe schliesst das Urteil selbst.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/strafe` `judge_offense` |
| **Vergehens-Regeln umlegen** | Legt je Art fest, ob sie zählt — aus, nur während einer Sperrzeit, oder immer. <br>*Historisiert: eine Änderung schreibt die Vergangenheit nicht um, sie wirkt nach vorn. `manual_offense` ist nicht schaltbar — eine selbst notierte Tat verwirft man mit dem Urteil, nicht mit der Regel.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/offense-rules` `set_offense_rules` |
| **Vergehen melden** | Stellt erkannte, bestrafte und verworfene Vergehen beiden Seiten in den Posteingang. <br>*Abgeleitete Vergehen erst ab dem Stichtag der Instanz — sonst kippte das erste Update die ganze Historie hinein.* | System | läuft von selbst | — |

## Geräte

Steckbrief: [55-geraete.md](55-geraete.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Geräte verwalten** | Anlegen, benennen, beschreiben, einer Kategorie zuordnen und archivieren. <br>*Die Code-Pflicht je Gerät darf nur der Keyholder umlegen.* | Sub, Keyholder (UI), Keyholder (MCP) | App (Träger), App (Keyholder), MCP | `/api/devices` `/api/devices/[id]` `get_devices` `upsert_device` |
| **Gerät wegräumen** | Löscht das Gerät hart, solange kein Eintrag daran hängt — sonst wird es nur archiviert, damit die Historie bleibt. <br>*Das harte Löschen nimmt Geräte- und Referenzfotos mit; die Vorschau sagt vorher, welcher der beiden Fälle eintritt.* | Sub, Keyholder (UI), Keyholder (MCP) | App (Träger), App (Keyholder), MCP | `delete_device` |
| **Geräte-Beurteilung hinterlegen** | Sicherheitsstufe, Abstreif-Risiko und Lookalike-Cluster — Einordnungen für die Keyholder-Entscheidung. <br>*Ein Lookalike-Cluster rechnet die Geräte-Zuordnung historischer Sessions rückwirkend neu.* | Keyholder (MCP) | MCP | `set_device_meta` |
| **Referenzbilder pflegen** | Kuratiert das Bildmaterial, mit dem die Geräte-Erkennung arbeitet. | Sub, Keyholder (UI) | App (Träger), App (Keyholder) | `/api/devices/[id]/references` `/api/devices/[id]/references/[refId]` |
| **Referenzbilder aus Einträgen übernehmen** | Übernimmt jüngere Verschluss-Fotos als Referenzbilder, als Dateikopie. | Sub, Keyholder (UI) | App (Träger), App (Keyholder) | `/api/devices/[id]/references/import-recent` |
| **Kategorien verwalten** | Anlegen, benennen, einfärben und sortieren. Die drei Regeln — Zeiterfassung, Pflichtfoto, Trainingsziele erlaubt — darf nur der Keyholder umlegen. <br>*Die eingebaute Kategorie lässt sich nicht löschen, und ihre drei Regeln sind für niemanden änderbar. Kategorien führen kein Versions-Token — hier gilt last write wins.* | Sub, Keyholder (UI), Keyholder (MCP) | App (Träger), App (Keyholder), MCP | `/api/categories` `/api/categories/[id]` `upsert_category` |
| **Kategorie löschen** | Entfernt eine Kategorie endgültig — nur, solange weder Geräte noch Trainingsziele darauf verweisen. <br>*Archivierte Geräte und soft-gelöschte Trainingsziele blockieren mit — sonst verlöre deren Historie still die Zuordnung.* | Sub, Keyholder (UI), Keyholder (MCP) | App (Träger), App (Keyholder), MCP | `delete_category` |
| **Gerät im Foto vorschlagen** | Schlägt beim Erfassen anhand des Bildes das getragene Gerät vor. | Sub | App (Träger) | `/api/detect-device` |
| **Geräte-Abgleich beim Kontroll-Foto** | Vergleicht nach dem Einreichen das Bild mit den Referenzbildern des deklarierten Geräts. <br>*Beratend: ein Abweichen ist KEIN Vergehen — das entsteht nur aus einer Anforderung.* | System | läuft von selbst | — |

## Box

Steckbrief: [60-box.md](60-box.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Box-Zustand ansehen** | Verriegelung (Soll und Ist), Akku, Riegelstellung, letzter Kontakt und die Vorwarnungen der Failsafes. | Sub, Keyholder (UI), Keyholder (MCP) | App (Träger), App (Keyholder), MCP | `/api/box` `get_box_state` |
| **Box wieder verriegeln** | Löst das Verriegeln nach einer Reinigungspause aus. | Sub | App (Träger) | `/api/box/relock` |
| **Gegenstelle für die Box** | Liefert der Box ihre Konfiguration und nimmt Zustandsmeldungen und Ereignisse entgegen. <br>*Der Tracker konfiguriert die Box nicht — Schwellen und Failsafes kommen von dort.* | System | Gegenstelle | `/api/integration/box/config` `/api/integration/box/status` `/api/integration/box/event` |
| **Siegel im Foto erkennen** | Prüft, ob das Siegel auf dem Bild unversehrt und lesbar ist. | System | läuft von selbst | `/api/detect-seal` |

## Bildersafe

Steckbrief: [15-eintraege.md](15-eintraege.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Schlüsselbild versiegeln** | Legt das Foto des Schlüsselbox-Codes versiegelt ab; freigegeben wird es erst, wenn Öffnen erlaubt ist. <br>*Gespeichert wird nur, ob Ziffern lesbar waren — nie die Zahl selbst.* | Sub | App (Träger) | `/api/bildersafe/seal` |

## Nachrichten

Steckbrief: [70-nachrichten.md](70-nachrichten.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Posteingang des Trägers** | Lesen, als gelesen oder ungelesen markieren, löschen, alles auf einmal — einzeln oder als Stapel. | Sub | App (Träger) | `/api/messages` `/api/messages/[id]` `/api/messages/[id]/read` `/api/messages/bulk` `/api/messages/read-all` |
| **Posteingang beschneiden** | Löscht einmal täglich gelesene Meldungen jenseits der Aufbewahrungsfrist (Vorgabe ein Jahr, per MESSAGE_RETENTION_DAYS einstellbar, 0 = aus). <br>*Ungelesene Meldungen bleiben liegen, egal wie alt — eine nie gesehene Zustellung ist kein Altpapier. Die Frist hängt am Zustand, nicht nur am Alter.* | System | läuft von selbst | — |
| **Posteingang des Keyholders** | Dieselbe Liste für die Meldungen an die Keyholder — eine gemeinsame Zeile je Träger, mit eigenem Lesestand. <br>*Löschen trifft alle Keyholder — es gibt nur diese eine Zeile.* | Keyholder (UI) | App (Keyholder) | `/api/admin/messages` `/api/admin/messages/[id]` `/api/admin/messages/[id]/read` `/api/admin/messages/bulk` `/api/admin/messages/read-all` |
| **Rückmeldung senden** | Nimmt eine Nachricht aus der App entgegen. | Sub, Keyholder (UI) | App (Träger) | `/api/feedback` |

## Benachrichtigungen

Steckbrief: [75-benachrichtigungen.md](75-benachrichtigungen.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Eigene Benachrichtigungen einstellen** | Mail und Push je Ereignis-Art, neun Arten. | Sub | App (Träger) | `/api/settings/notifications` |
| **Benachrichtigungen eines Trägers einstellen** | Dieselben Schalter aus der Keyholder-Sicht. | Keyholder (UI) | App (Keyholder) | `/api/admin/notifications` |
| **Push-Empfang einrichten** | Meldet Browser-Abonnements und Gerätetoken der App an und wieder ab. | Sub, Keyholder (UI) | App (Träger) | `/api/push/subscribe` `/api/push/native-subscribe` `/api/push/vapid-public-key` |
| **Terminierte Direktiven zustellen** | Der Minuten-Takt stellt Kontrollen, Sperrzeiten, Orgasmus-Fenster und Aufgaben zu, sobald sie wirksam werden. <br>*Bis dahin existiert die Direktive für den Träger nicht — keine Anzeige, keine laufende Frist.* | System | läuft von selbst | — |

## MCP

Steckbrief: [80-kontext.md](80-kontext.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Keyholder-Übersicht** | Die eine Abfrage, die den grössten Teil beantwortet: laufende Strecke gegen Bestwert, was gerade getragen wird, Nächstes, Ziele, offene Vergehen, Box und Gesundheits-Halt. | Keyholder (MCP) | MCP | `keyholder_dashboard` |
| **Regelstand lesen** | Reinigungs-Regeln, Auto-Kontroll-Einstellungen und die geltenden Vergehens-Regeln in einem Zug. | Keyholder (MCP) | MCP | `get_context` |
| **Modell-Referenz abrufen** | Erklärt der Keyholder-KI die Begriffe und ihre Zusammenhänge, ohne dass sie Code sehen muss. | Keyholder (MCP) | MCP | `explain_model` |
| **Notizen führen** | Private, versionierte Beobachtungen anlegen, suchen und an Objekte hängen. <br>*Supersession statt Löschen; der Träger sieht nichts davon.* | Keyholder (MCP) | MCP | `upsert_note` `query_notes` `link_note` |
| **Termine und wiederkehrende Kontexte pflegen** | Einmalige Termine und Wochen-Slots, jeweils mit der Angabe, ob sie Gerätefreiheit verlangen. | Keyholder (MCP) | MCP | `upsert_appointment` `upsert_recurring_context` |
| **Gesundheits-Halt setzen** | Setzt die Direktiven aus — die eine Bremse, die über allem steht. | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `set_health_hold` |
| **Handlungsprotokoll lesen** | Jeder schreibende MCP-Aufruf mit Werkzeug, Handelndem, Pflicht-Begründung und betroffenem Objekt. | Keyholder (MCP) | MCP | `get_action_log` |
| **MCP-Endpunkt** | Die Gegenstelle, über die eine Keyholder-KI alle Werkzeuge erreicht. <br>*Die Werkzeugliste ist pro Verbindung gecacht — ein neuer Chat allein genügt nicht.* | Keyholder (MCP) | Gegenstelle | `/api/[transport]` |

## Zugang

Steckbrief: [85-zugang.md](85-zugang.md)

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Anmelden** | Benutzername und Passwort gegen den bcrypt-Hash, IP-begrenzt gegen Durchprobieren. | Sub, Keyholder (UI) | App (Träger) | `/api/auth/lockout` |
| **Passkey anlegen und damit anmelden** | Biometrische Anmeldung registrieren, verwenden, auflisten und entfernen. | Sub, Keyholder (UI) | App (Träger) | `/api/auth/passkey/register` `/api/auth/passkey/authenticate` `/api/auth/passkey/list` |
| **Passwort zurücksetzen** | Token per Mail anfordern und damit ein neues Passwort setzen — der einzige Weg ohne Sitzung. <br>*Bei einem Admin-Konto während laufender Sperrzeit entsteht daraus ein festgeschriebenes Vergehen.* | Sub, Keyholder (UI) | App (Träger) | `/api/auth/forgot-password` `/api/auth/reset-password` |
| **Passwort ändern** | Setzt ein neues Passwort; das alte wird bewusst nicht verlangt. | Sub, Keyholder (UI) | App (Träger) | `/api/settings/password` |
| **E-Mail-Adresse ändern** | Setzt die Zustelladresse des Kontos. | Sub | App (Träger) | `/api/settings/email` |
| **Darstellung einstellen** | Sprache, Startseite, das Ausblenden des eigenen Trackers und die Zusammenstellung des eigenen Dashboards. | Sub | App (Träger) | `/api/settings/locale` `/api/settings/start-page` `/api/settings/hide-own-tracker` `/api/settings/dashboard-layout` |
| **Zeitzone setzen** | Die Wanduhr des Trägers. <br>*Mehr als Darstellung: Reinigungsfenster, Schlaf-Fenster und der Kalendertag des Kontingents rechnen darin.* | Sub | App (Träger) | `/api/settings/timezone` |
| **Konten verwalten** | Anlegen, bearbeiten, Rolle setzen, Passwort setzen und löschen. <br>*Dieselbe Route trägt auch die Reinigungs-, Auto-Kontroll- und Eskalations-Einstellungen.* | Keyholder (UI) | App (Keyholder) | `/api/admin/users` `/api/admin/users/[id]` |
| **Keyholder zuordnen** | Verknüpft ein Admin-Konto mit einem Träger — die eigentliche Berechtigung. <br>*Ohne Zuordnung sieht ein Admin-Konto überall leere Listen, nicht alle Träger.* | Keyholder (UI) | App (Keyholder) | `/api/admin/users/[id]/keyholders` |
| **Fremdanwendung verbinden** | Registrierung, Freigabe, Token-Ausgabe und Widerruf nach OAuth mit PKCE — der Weg, auf dem eine Keyholder-KI Zugang bekommt. <br>*Gespeichert werden nur Hashes, nie die Token selbst.* | Keyholder (UI) | Gegenstelle | `/api/oauth/register` `/api/oauth/authorize` `/api/oauth/token` `/api/oauth/revoke` |
| **Anmeldung aus dem Portal** | Nimmt ein Einmal-Token des Portals an und meldet den Träger an. <br>*Die Token-Kennung wird festgehalten — dieselbe zweimal einzulösen scheitert.* | Portal | Gegenstelle | `/api/portal-login` |
| **Version und Bau-Datum melden** | Womit die App prüft, ob eine neue Fassung läuft. | System | Gegenstelle | `/api/version` |
| **Auf neue Fassung prüfen** | Liest den Changelog der veröffentlichten Fassung und meldet, wenn diese Instanz zurückliegt. | System | läuft von selbst | `/api/upstream-changelog` |
| **Lebenszeichen** | Der Takt, an dem die zeitgesteuerten Abläufe hängen. | System | läuft von selbst | `/api/heartbeat` |
| **App-Verknüpfung für iOS** | Die Datei, mit der iOS Links dieser Instanz der App zuordnet. | System | Gegenstelle | `/api/apple-app-site-association` |

## Gewicht

| Funktion | Was sie tut | Wer | Wo | Endpunkt |
|---|---|---|---|---|
| **Gewichts-Angaben pflegen** | Körpergrösse, Anzeige-Einheit und das eigene Zielgewicht. <br>*Nur erreichbar, solange die Keyholderin das Gewichtstracking für diesen Träger freigeschaltet hat — die Route prüft das selbst, nicht nur die Oberfläche.* | Sub | App (Träger) | `/api/settings/weight` |
| **Gewicht erfassen** | Eine Messung je Kalendertag — vom Träger selbst oder von der Keyholderin für ihn. <br>*Der Träger braucht einen Beleg (Foto oder Notiz), die Keyholderin nicht — sie steht nicht vor seiner Waage. Eine zweite Meldung desselben Tages ersetzt die erste.* | Sub, Keyholder (UI) | App (Träger), App (Keyholder) | `/api/weight` |
| **Gewichts-Reihe lesen (KI)** | Punkte, aktueller Wert samt BMI, Trend, Zielgewicht samt Fortschritt und Tage seit der letzten Meldung. <br>*Alle Werte metrisch. `daysSinceLastReport` ist die Zahl, an der die Meldepflicht hängt.* | Keyholder (MCP) | MCP | `weight_history` |
| **Gewicht eintragen (KI)** | Eine Messung je Kalendertag nachtragen — die Einstellungen liegen in `weight-keyholder`. <br>*Ihr Eintrag braucht keinen Foto-Beleg — sie steht nicht vor seiner Waage.* | Keyholder (MCP) | MCP | `log_weight` |
| **Waagen-Anzeige lesen** | Liest aus dem Foto der Waage die angezeigte Zahl und, wo ablesbar, die Einheit. <br>*Ein VORSCHLAG für das Formular, kein Messwert: der Mensch bestätigt oder korrigiert. Gespeichert wird die gelesene Zahl getrennt vom bestätigten Wert. Ohne Vision-Provider gibt es keine Erkennung — lokales OCR liest auf Sieben-Segment-Anzeigen zuverlässig Unsinn.* | Sub | App (Träger) | `/api/detect-weight` |
| **Gewichtstracking einrichten** | Freischaltung, Wiege-Fenster (Zeit, Dauer, Wochentage, Erinnerung) und ihr Zielgewicht. <br>*Ihr Zielgewicht gilt, seines bleibt sichtbar. Das Abschalten nimmt die Meldepflicht mit — sonst zählte die Aus-Zeit als lauter versäumte Meldungen.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/users/[id]` `set_weight_tracking` |
| **Freigabe an das Gewicht knüpfen** | Eine Vorgabe, die den nächsten Orgasmus freigibt, sobald das MITTEL der letzten Tage eine Schwelle erreicht. Erfüllt sie sich, entsteht beim nächsten Wiegen ein Orgasmus-Fenster (Gelegenheit). <br>*Geprüft wird das Mittel, nicht der Tageswert — ein einzelnes Wiegen schwankt um ein bis zwei Kilo. Ausgewertet wird nur die ERSTE Messung eines Tages; wer nachwiegt, könnte sonst so lange wiegen, bis es passt. Die Vorgabe ist verbraucht, sobald sie ausgelöst hat; sie erzeugt NIE ein Vergehen — die Konsequenz ist Warten.* | Keyholder (UI), Keyholder (MCP) | App (Keyholder), MCP | `/api/admin/weight-release` `set_weight_release` |

## Läuft von selbst

Dieselben Funktionen noch einmal beisammen — die, die niemand auslöst. Sie sind der häufigste
Grund für die Frage, welche Einstellung etwas verursacht hat: bei den meisten gibt es keine.

| Funktion | Mechanik | Was sie tut |
|---|---|---|
| **Code im Foto erkennen** | Kontrollen | Liest den handschriftlichen Kontroll-Code aus dem Bild und vergleicht ihn mit dem geforderten. |
| **Tagesplan würfeln und zustellen** | Auto-Kontrollen | Zieht zur Mitternacht des Trägers eine Anzahl aus der Spanne, verteilt die Kontrollen überlappungsfrei über das Wach-Fenster und stellt sie bei Fälligkeit zu. |
| **Kontrolle nach dem Wiederverschluss** | Auto-Kontrollen | Nach jedem selbst erfassten Wiederverschluss aus einer Reinigungspause folgt selbsttätig eine Kontrolle. |
| **Überfällige Kontrolle eskalieren** | Kontrollen | Stufe 1 mahnt, Stufe 2 bucht die Öffnung bzw. das Ablegen selbst. |
| **Aufgaben auswerten und melden** | Aufgaben | Leitet den Zustand jeder Aufgabe aus den Einträgen ab, stellt terminierte zu und meldet das Ergebnis an beide Seiten. |
| **Vergehen melden** | Strafbuch | Stellt erkannte, bestrafte und verworfene Vergehen beiden Seiten in den Posteingang. |
| **Geräte-Abgleich beim Kontroll-Foto** | Geräte | Vergleicht nach dem Einreichen das Bild mit den Referenzbildern des deklarierten Geräts. |
| **Siegel im Foto erkennen** | Box | Prüft, ob das Siegel auf dem Bild unversehrt und lesbar ist. |
| **Posteingang beschneiden** | Nachrichten | Löscht einmal täglich gelesene Meldungen jenseits der Aufbewahrungsfrist (Vorgabe ein Jahr, per MESSAGE_RETENTION_DAYS einstellbar, 0 = aus). |
| **Terminierte Direktiven zustellen** | Benachrichtigungen | Der Minuten-Takt stellt Kontrollen, Sperrzeiten, Orgasmus-Fenster und Aufgaben zu, sobald sie wirksam werden. |
| **Auf neue Fassung prüfen** | Zugang | Liest den Changelog der veröffentlichten Fassung und meldet, wenn diese Instanz zurückliegt. |
| **Lebenszeichen** | Zugang | Der Takt, an dem die zeitgesteuerten Abläufe hängen. |
