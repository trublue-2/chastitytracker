# Stellschrauben-Register

<!-- GENERIERT — nicht von Hand ändern. Quelle: prisma/schema.prisma +
     src/lib/funktionsmodellRegistry.ts · neu erzeugen: `npm run funktionsmodell` -->

Jedes Feld, das Verhalten steuert: 55 Stellschrauben über 6 Modelle.
Typ und Default stammen aus dem Schema, die Bedeutung aus der Registry — beides wird bei jedem
Testlauf gegeneinander geprüft, ein neues Feld ohne Eintrag lässt `npm test` fehlschlagen.

**Gilt** unterscheidet den Dauerschalter am Konto von dem Wert, der nur für EINE Direktive gilt.
Die beiden `reinigungErlaubt` sind der Fall, an dem das regelmässig schiefgeht: beide müssen zutreffen.

## Sperrzeit & Verschluss

Steckbrief: [10-sperrzeit.md](10-sperrzeit.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `VerschlussAnforderung.nachricht` | String? | — | je Direktive | Begleittext an den Sub; erscheint in der Meldung und im Posteingang. | Keyholder (UI), Keyholder (MCP) | Nachrichten | — |
| `VerschlussAnforderung.endetAt` | DateTime? | — | je Direktive | Bei einer SPERRZEIT das Ende (leer = unbefristet), bei einer ANFORDERUNG die Frist zum Einschliessen. | Keyholder (UI), Keyholder (MCP) | Sperrzeit, Box, Strafbuch | `queries.ts:foldActiveSperrzeiten` |
| `VerschlussAnforderung.dauerH` | Float? | — | je Direktive | Mindest-Tragedauer einer Anforderung; die Uhr startet beim tatsächlichen Verschluss. Alternative zu `sperrEndetAt`. | Keyholder (UI), Keyholder (MCP) | Sperrzeit | `entryFulfilment.ts` |
| `VerschlussAnforderung.sperrEndetAt` | DateTime? | — | je Direktive | Absolutes Sperr-Ende einer Anforderung (feste Wanduhr). Ein später Verschluss verschiebt es NICHT — anders als `dauerH`. | Keyholder (UI), Keyholder (MCP) | Sperrzeit | `entryFulfilment.ts` |
| `VerschlussAnforderung.deviceId` | String? | — | je Direktive | Verlangt ein bestimmtes Gerät. Nur hieraus entsteht das Vergehen „falsches Gerät“ — der Bild-Abgleich allein tut es nie. | Keyholder (UI), Keyholder (MCP) | Sperrzeit, Geräte, Strafbuch | — |
| `VerschlussAnforderung.reinigungErlaubt` | Boolean | `false` | je Direktive | Erlaubt DIESE Sperrzeit eine Reinigungsöffnung (und damit einen Gerätewechsel)? Es müssen ALLE gleichzeitig aktiven Sperrzeiten erlauben, nicht nur die neueste. | Keyholder (UI), Keyholder (MCP) | Sperrzeit, Reinigung, Box, Geräte | `queries.ts:foldActiveSperrzeiten` |
| `VerschlussAnforderung.wirksamAb` | DateTime? | — | je Direktive | Terminierte Auslösung. Bis dahin existiert die Direktive für den Sub nicht: keine Anzeige, keine Meldung, keine laufende Frist. | Keyholder (UI), Keyholder (MCP) | Sperrzeit, Benachrichtigungen | — |

## Reinigung

Steckbrief: [20-reinigung.md](20-reinigung.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `User.reinigungErlaubt` | Boolean | `false` | dauerhaft | Ob Reinigungspausen überhaupt erlaubt sind. Notwendig, nicht hinreichend — eine aktive Sperrzeit muss es zusätzlich erlauben. | Keyholder (UI), Keyholder (MCP) | Reinigung, Sperrzeit, Box, Strafbuch, Geräte | `queries.ts:cleaningBlockReason` |
| `User.reinigungMaxMinuten` | Int | `15` | dauerhaft | Höchstdauer EINER Pause. Darüber hinaus zählt die Pause als Tragezeit-Unterbrechung und wird zum erkannten Vergehen. | Keyholder (UI), Keyholder (MCP) | Reinigung, Strafbuch, Sessions/Statistik | `cleaningRules.ts:reinigungRulesAt` |
| `User.reinigungMaxProTag` | Int | `0` | dauerhaft | ANZAHL Öffnungen pro Kalendertag des Subs (kein Minutenbudget). 0 = unbegrenzt. Wird nur erkannt, nie durchgesetzt. | Keyholder (UI), Keyholder (MCP) | Reinigung, Strafbuch | `reinigungService.ts:maxPausesPerDaySentinel` |
| `User.reinigungsFenster` | String? | — | dauerhaft | Tages-Zeitfenster (JSON-Liste). Binden NUR während einer Sperrzeit, die die Reinigung erlaubt. Leere Liste = nicht zeitgebunden, kein Verbot. | Keyholder (UI), Keyholder (MCP) | Reinigung, Box | `queries.ts:cleaningWindowBindingStatus` |

## Kontrollen

Steckbrief: [30-kontrollen.md](30-kontrollen.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `User.autoKontrolleAktiv` | Boolean | `false` | dauerhaft | Hauptschalter der Automatik. Aus schaltet BEIDES ab: den gewürfelten Tagesplan und die Kontrolle nach dem Wiederverschluss. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen, Kontrollen, Strafbuch | `autoKontrolleService.ts` |
| `User.autoKontrollePerDayMin` | Int | `0` | dauerhaft | Untergrenze der pro Tag gewürfelten Anzahl. Zusammen mit Max auf 0 bleibt nur die Kontrolle nach dem Wiederverschluss. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:generateAutoKontrollen` |
| `User.autoKontrollePerDayMax` | Int | `0` | dauerhaft | Obergrenze derselben Auslosung. Unter Min gesetzt wird er auf Min angehoben statt abgelehnt. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:clampPerDay` |
| `User.autoKontrolleRuheVon` | String | `"22:00"` | dauerhaft | Beginn des Schlaf-Fensters (Wanduhr des Subs). Darin wird weder ausgelöst noch eine Frist platziert. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:isInQuietMinutes` |
| `User.autoKontrolleRuheBis` | String | `"06:00"` | dauerhaft | Ende des Schlaf-Fensters. Das Komplement daraus ist das Wach-Fenster, über das der Tagesplan verteilt wird. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:awakeWindow` |
| `User.autoKontrolleFristVon` | Int | `15` | dauerhaft | Untergrenze der Erfüllungsfrist je Kontrolle (Minuten). Bleibt sie vor dem Schlaf-Beginn nicht mehr ganz übrig, entfällt der Slot. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:windowDeadline` |
| `User.autoKontrolleFristBis` | Int | `60` | dauerhaft | Obergrenze derselben Frist; je Kontrolle wird zufällig aus der Spanne gezogen. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:clampFrist` |
| `User.autoKontrolleFensterVon` | String | `""` | dauerhaft | Beginn eines optionalen festen Auslöse-Fensters. Leer = ganzes Wach-Fenster. Wrappt bewusst nicht über Mitternacht. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:fixedWindowMinutes` |
| `User.autoKontrolleFensterBis` | String | `""` | dauerhaft | Ende desselben Fensters. Liegt es vollständig im Schlaf-Fenster, wird die Kombination abgelehnt statt wirkungslos gespeichert. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:triggerWindowAllQuiet` |
| `User.autoKontrolleNurBeiSperre` | Boolean | `false` | dauerhaft | Stellt den Tagesplan nur während einer laufenden Sperrzeit zu. Gilt NICHT für die Kontrolle nach dem Wiederverschluss. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen, Sperrzeit | `autoKontrolleService.ts` |
| `User.inspectionReminderEnabled` | Boolean | `false` | dauerhaft | Stufe 1: mahnt eine überfällige Kontrolle an. Setzt nur den Uhr-Anker für Stufe 2 — ohne sie beginnt Stufe 2 nie. | Keyholder (UI) | Kontrollen, Benachrichtigungen | `inspectionEscalationService.ts` |
| `User.inspectionReminderDelayMinutes` | Int | `5` | dauerhaft | Verzug bis zur Mahnung, gemessen ab dem Ablauf der Kontroll-Frist. | Keyholder (UI) | Kontrollen, Benachrichtigungen | `inspectionEscalationService.ts` |
| `User.inspectionAutoMarkEnabled` | Boolean | `false` | dauerhaft | Stufe 2: bucht die unbeantwortete Kontrolle selbst als Öffnung bzw. Ablegen. Hebt dabei bewusst KEINE Sperrzeit auf. | Keyholder (UI) | Kontrollen, Einträge, Sessions/Statistik, Strafbuch | `queries.ts:releaseSperrzeitenOnOpen` |
| `User.inspectionAutoMarkDelayMinutes` | Int | `60` | dauerhaft | Verzug bis zu dieser Buchung, gemessen ab dem Stempel der Stufe 1. | Keyholder (UI) | Kontrollen | `inspectionEscalationService.ts` |
| `KontrollAnforderung.categoryId` | String? | — | je Direktive | ZIEL der Kontrolle: leer = der KG (verlangt einen aktiven Verschluss), gesetzt = eine Trage-Kategorie. Je Ziel darf nur eine Kontrolle laufen. | Keyholder (UI), Keyholder (MCP) | Kontrollen | `kontrolleService.ts:hasActiveKontrolle` |
| `KontrollAnforderung.deviceId` | String? | — | je Direktive | Verengt das Ziel auf genau ein Gerät und hat Vorrang vor der Kategorie. Es muss das getragene sein, sonst ist die Kontrolle nicht erfüllbar. | Keyholder (UI), Keyholder (MCP) | Kontrollen, Geräte | — |
| `KontrollAnforderung.kommentar` | String? | — | je Direktive | Begleittext an den Sub. | Keyholder (UI), Keyholder (MCP) | Nachrichten | — |
| `KontrollAnforderung.deadline` | DateTime | (keiner) | je Direktive | Erfüllungsfrist. Nach Ablauf verschwindet die Kontrolle nicht, sie wird überfällig — und ist der Startpunkt der Eskalation. | Keyholder (UI), Keyholder (MCP) | Kontrollen, Strafbuch | `inspectionEscalationService.ts` |
| `KontrollAnforderung.wirksamAb` | DateTime? | — | je Direktive | Terminierte Zustellung; bis dahin für den Sub unsichtbar und ohne laufende Frist. Auch der Weg, auf dem der Tagesplan vorab angelegt wird. | Keyholder (UI), Keyholder (MCP), System | Kontrollen, Auto-Kontrollen | — |
| `Device.requireInspectionCode` | Boolean | `true` | dauerhaft | Verlangt eine Kontrolle mit DIESEM Gerät den handschriftlichen Code im Foto? Aus: die Erfüllung läuft über die eine offene Anforderung statt über den Code-Vergleich. | Keyholder (UI) | Kontrollen | `kontrolleService.ts` |

## Geräte & Kategorien

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `DeviceCategory.name` | String | (keiner) | dauerhaft | Anzeigename der Kategorie; frei änderbar, der `slug` bleibt. | Sub, Keyholder (UI) | Oberfläche | — |
| `DeviceCategory.color` | String | (keiner) | dauerhaft | Farbmarke der Kategorie (CSS-Variablen-Suffix). | Sub, Keyholder (UI) | Oberfläche | — |
| `DeviceCategory.icon` | String | (keiner) | dauerhaft | Symbol der Kategorie (lucide-Name). | Sub, Keyholder (UI) | Oberfläche | — |
| `DeviceCategory.trackingEnabled` | Boolean | `true` | dauerhaft | Aus = reine Inventar-Kategorie: keine Trage-Sessions, keine Statistik. Abwesenheit in den Auswertungen ist dann keine Nichtnutzung. | Sub, Keyholder (UI) | Sessions/Statistik, Geräte, Einträge | — |
| `DeviceCategory.requirePhoto` | Boolean | `false` | dauerhaft | Ein Trage-Beginn dieser Kategorie verlangt ein Bild. | Sub, Keyholder (UI) | Einträge, Geräte | — |
| `DeviceCategory.allowVorgaben` | Boolean | `true` | dauerhaft | Aus = die Kategorie lässt sich in keinem Trainingsziel verwenden. | Sub, Keyholder (UI) | Trainingsziele | — |
| `DeviceCategory.sortOrder` | Int | `0` | dauerhaft | Reihenfolge in Listen und Auswahlfeldern. | Sub, Keyholder (UI) | Oberfläche | — |
| `Device.categoryId` | String? | — | dauerhaft | Zuordnung zur Kategorie — entscheidet, welche Kategorie-Regeln (Tracking, Pflichtfoto, Trainingsziele) für dieses Gerät gelten. | Sub, Keyholder (UI) | Geräte, Kontrollen, Trainingsziele, Sessions/Statistik | — |
| `Device.name` | String | (keiner) | dauerhaft | Anzeigename. Geht zusätzlich in die Bilderkennung ein — sie sieht Bilder und Namen, sonst nichts. | Sub, Keyholder (UI) | Geräte, Oberfläche | — |
| `Device.archivedAt` | DateTime? | — | dauerhaft | Soft-Delete: gesetzt = archiviert, aus Auswahllisten raus, Historie bleibt. | Sub, Keyholder (UI) | Geräte, Sessions/Statistik | — |
| `Device.securityLevel` | String? | — | dauerhaft | SECURING oder TRUST_ONLY — Einordnung für die Keyholder-Entscheidung. Wird nirgends durchgesetzt. | Keyholder (MCP) | MCP | `mcp/devices.ts:set_device_meta` |
| `Device.lookalikeClusterId` | String? | — | dauerhaft | Gleiche Optik = gleicher Cluster. Ein Bild-Konflikt INNERHALB eines Clusters ist nie ein Vergehen; Setzen rechnet die Geräte-Zuordnung historischer Sessions rückwirkend neu. | Keyholder (MCP) | Geräte, Sessions/Statistik, Strafbuch | `mcp/devices.ts:set_device_meta` |
| `Device.pullOffRisk` | Boolean? | — | dauerhaft | Abstreifbar? `null` = nie beurteilt, nicht „sicher“. Reine Beurteilung ohne Durchsetzung. | Keyholder (MCP) | MCP | `mcp/devices.ts:set_device_meta` |

## Erfassung & Vokabular

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `User.mobileDesktopUpload` | Boolean | `false` | dauerhaft | Erlaubt auf Mobilgeräten die Dateiauswahl statt nur die Kamera — schwächt jeden Foto-Nachweis, deshalb Admin-Feld. | Keyholder (UI) | Kontrollen, Aufgaben, Einträge, Oberfläche | — |
| `User.orgasmusArtenConfig` | String? | — | dauerhaft | Auswahlliste der Orgasmus-Arten im Erfassungsformular (JSON). Leer = die eingebauten Arten. | Keyholder (UI) | Einträge, Orgasmus | `reasonsService.ts` |
| `User.oeffnenGruendeConfig` | String? | — | dauerhaft | Auswahlliste der Öffnungsgründe. `REINIGUNG` ist der Grund, an dem die gesamte Reinigungslogik hängt — er lässt sich nicht wegkonfigurieren. | Keyholder (UI) | Einträge, Reinigung, Sperrzeit | `reasonsService.ts` |

## Benachrichtigungen

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `NotificationPreference.mail` | Boolean | `true` | dauerhaft | Ob dieses Ereignis per Mail zugestellt wird. | Sub, Keyholder (UI) | Benachrichtigungen | `notificationPrefs.ts` |
| `NotificationPreference.push` | Boolean | `true` | dauerhaft | Ob dieses Ereignis als Push zugestellt wird (Web-Push und native Geräte). | Sub, Keyholder (UI) | Benachrichtigungen | `notificationPrefs.ts` |

## Keyholder-Steuerung & MCP

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `User.mcpKeyholderInstructions` | String? | — | dauerhaft | Dauerauftrag an die Keyholder-KI; wird ihr bei jeder MCP-Verbindung mitgegeben. Der Sub sieht ihn nie. | Keyholder (UI) | MCP | `app/api/[transport]/route.ts` |

## Konto, Zugang & Darstellung

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `User.role` | String | `"user"` | dauerhaft | `user` oder `admin`. Entscheidet über Admin-Oberfläche, MCP-Zugang und das Handeln für fremde Konten. | Keyholder (UI), Portal | Zugang, MCP | `authGuards.ts:requireAdminApi` |
| `User.timezone` | String | `"Europe/Zurich"` | dauerhaft | Die Wanduhr des Subs. Kalendertag, Reinigungsfenster und Schlaf-Fenster rechnen darin — nicht in der Serverzone. | Sub | Reinigung, Auto-Kontrollen, Sessions/Statistik | `utils.ts:APP_TZ` |
| `User.startPage` | String | `"auto"` | dauerhaft | Startseite nach der Anmeldung; `auto` wählt sie nach Rolle. | Sub | Oberfläche | `userSelfField.ts` |
| `User.hideOwnTracker` | Boolean | `false` | dauerhaft | Blendet den eigenen Tracker in der Keyholder-Ansicht aus — für Admin-Konten, die selbst keinen führen. | Sub | Oberfläche | `ownTracker.ts` |
| `User.locale` | String | `"de"` | dauerhaft | Sprache der Oberfläche UND aller Anschreiben — auch der Portal-Mails, die sie von hier lesen. | Sub, Keyholder (UI) | Oberfläche, Benachrichtigungen | `emailI18n.ts` |

## Bewusst keine Stellschrauben

Der Rest der geprüften Modelle, mit dem Grund, warum er nichts steuert. Diese Liste ist der
eigentliche Vollständigkeitsbeweis: ein Feld, das weder oben noch hier steht, gibt es nicht.

| Feld | Art | Warum keine Stellschraube |
|---|---|---|
| `User.id` | Identität | Primärschlüssel. |
| `User.username` | Identität | Anmeldename, zugleich die Kennung in Meldungen. |
| `User.passwordHash` | Identität | bcrypt-Hash. Kein Verhalten, sondern der Zugang selbst. |
| `User.email` | Identität | Zustelladresse; steuert nichts, ausser dass ohne sie keine Mail geht. |
| `User.createdAt` | Identität | Anlage-Zeitpunkt. |
| `User.autoInspectionPlannedFor` | Laufzeitzustand | Merker des Planers: bis wann der Tagesplan gewürfelt ist. Wird vom Poller gesetzt, nicht von Hand. |
| `Device.id` | Identität | Primärschlüssel. |
| `Device.userId` | Identität | Eigentümer. |
| `Device.description` | Datensatz | Freitext des Eigentümers. |
| `Device.imageUrl` | Datensatz | Titelbild. Referenzbilder für die Erkennung stehen in DeviceReferenceImage. |
| `Device.purchasePrice` | Datensatz | Inventarangabe. |
| `Device.currency` | Datensatz | Währung zur Inventarangabe. |
| `Device.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `Device.material` | Datensatz | Beschreibendes Merkmal für den Keyholder. |
| `Device.bauform` | Datensatz | Beschreibendes Merkmal für den Keyholder. |
| `Device.healthFlags` | Datensatz | Beobachtungen zur Verträglichkeit (JSON-Liste), rein informativ. |
| `Device.retentionNotes` | Datensatz | Freitext zum Sitz des Geräts, rein informativ. |
| `Device.version` | Laufzeitzustand | Optimistic-Concurrency-Token der MCP-Edits. |
| `DeviceCategory.id` | Identität | Primärschlüssel. |
| `DeviceCategory.userId` | Identität | Eigentümer. |
| `DeviceCategory.slug` | Identität | Stabile Kennung; `kg` ist die eingebaute Kategorie. |
| `DeviceCategory.isBuiltIn` | Datensatz | Nur für den KG gesetzt; verhindert das Löschen. |
| `DeviceCategory.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `VerschlussAnforderung.id` | Identität | Primärschlüssel. |
| `VerschlussAnforderung.userId` | Identität | Betroffener Sub. |
| `VerschlussAnforderung.art` | Datensatz | `ANFORDERUNG` oder `SPERRZEIT` — die Bauart der Zeile, nicht einstellbar: sie ergibt sich daraus, welche Direktive gestellt wurde. |
| `VerschlussAnforderung.createdBy` | Nachweis | Wer die Direktive angeordnet hat; wird an die daraus entstehende Sperrzeit vererbt. `null` = System. |
| `VerschlussAnforderung.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `VerschlussAnforderung.fulfilledAt` | Laufzeitzustand | Gesetzt, wenn der Sub sich eingeschlossen hat. |
| `VerschlussAnforderung.withdrawnAt` | Laufzeitzustand | Gesetzt beim Zurückziehen oder beim Bruch durch eine Öffnung. |
| `VerschlussAnforderung.endedReason` | Nachweis | WARUM zurückgezogen: `keyholder` (bewusst) oder `opening` (vom Sub gebrochen). Ohne das Feld sähe beides gleich aus. |
| `VerschlussAnforderung.benachrichtigtAt` | Laufzeitzustand | Wann die Zustellung rausging. |
| `KontrollAnforderung.id` | Identität | Primärschlüssel. |
| `KontrollAnforderung.userId` | Identität | Betroffener Sub. |
| `KontrollAnforderung.code` | Laufzeitzustand | Zufallscode fürs Foto — vom Server erzeugt. `null`, wenn das Gerät keinen verlangt (`Device.requireInspectionCode`). |
| `KontrollAnforderung.createdBy` | Nachweis | Wer die Kontrolle gestellt hat; `null` = die Automatik. |
| `KontrollAnforderung.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `KontrollAnforderung.fulfilledAt` | Laufzeitzustand | Serverseitig beim erfüllenden Prüf-Eintrag gesetzt, nie editierbar. |
| `KontrollAnforderung.withdrawnAt` | Laufzeitzustand | Gesetzt beim Zurückziehen. |
| `KontrollAnforderung.benachrichtigtAt` | Laufzeitzustand | Wann die Zustellung rausging. |
| `KontrollAnforderung.auto` | Laufzeitzustand | Kennzeichnet die vom Tagesplan erzeugten Zeilen. |
| `KontrollAnforderung.entryId` | Laufzeitzustand | Der erfüllende Prüf-Eintrag. |
| `KontrollAnforderung.benachrichtigtReminderAt` | Laufzeitzustand | Stempel der Stufe 1 — zugleich der Uhr-Anker, ab dem Stufe 2 zählt. |
| `KontrollAnforderung.autoMarkedRemovedAt` | Laufzeitzustand | Stempel der Stufe 2. |
| `KontrollAnforderung.autoMarkedEntryId` | Laufzeitzustand | Der von Stufe 2 erzeugte Öffnen-Eintrag — bewusst eine eigene Spalte, nicht die des erfüllenden Eintrags. |
| `KontrollAnforderung.cleaningRelock` | Laufzeitzustand | Herkunft: aus einem Wiederverschluss nach einer Reinigungspause statt aus dem Tagesplan. Nicht aus der Zeile rekonstruierbar. |
| `NotificationPreference.id` | Identität | Primärschlüssel. |
| `NotificationPreference.userId` | Identität | Empfänger. |
| `NotificationPreference.eventType` | Datensatz | Welches Ereignis die Zeile betrifft — die Zeile selbst ist der Schalter, nicht dieses Feld. |
