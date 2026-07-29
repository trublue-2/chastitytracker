# Kommunikation in der App: Posteingang für Sub und Keyholder

**Status:** Konzept · nichts umgesetzt
**Erstellt:** 2026-07-26
**Auslöser:** Das App-Icon zeigt ein Nachrichten-Badge, es gibt in der App aber keinen Ort, an dem man
Nachrichten nachliest. Bestandsaufnahme und Entwurf entstanden aus vier parallelen Code-Analysen.
**Zielversion:** 5.x — nicht auf `main` (4.52.x).
**Hinweis zur Umsetzung:** Etappe 1 wurde mit v4.56.0 von `main` aus gebaut (Branch `feat/messages`), nicht auf `feat/tasks` — das Feature hängt an keiner Stelle vom Aufgaben-Konstrukt ab. Belege im Text, die auf `TaskCard.tsx`, `taskService.ts` oder `ExpandToggle.tsx` zeigen, beziehen sich auf den v5-Branch und existieren auf `main` nicht.

Verwandte Issues: **#37** (Träger erbittet Aufschluss/Orgasmus), **#36** (offene Strafen sichtbar),
**#38** (Belohnungen), **#40** (Punktekonto), **#42** (Frist-Widerspruch in der Kontroll-Mail).

---

## 1. Bestand

### 1.1 Was die App heute verschickt

26 Meldungstypen, praktisch alle über `notifyUser` (`src/lib/notify.ts:27-44`) als **Mail und Push
gleichzeitig**, **ohne jede Persistenz**. Die Texte kommen aus dem `emails`-Namespace beider
`messages/*.json` und werden in der Sprache des *Empfängers* gerendert (`notify.ts:32-34`).

Es existiert weder eine Route noch eine Tabelle noch eine Seite für Nachrichten.

| Richtung | Umfang |
|---|---|
| Keyholder / KI → Sub | 16 Typen. Vier tragen echten Keyholder-Freitext: `KontrollAnforderung.kommentar`, `VerschlussAnforderung.nachricht`, `OrgasmusAnforderung.nachricht`, `StrafeRecord.reason` — dazu in v5 `Task.description` und `Task.penaltyReason` |
| Sub → Keyholder | **Kein Nachrichtenkanal.** Es gibt nur Ereignismeldungen über Handlungen (`src/app/api/entries/route.ts:301-430`) |
| System → beide | Mahnungen, Auto-Buchungen, Aufgaben-Ergebnisse, Passwort-Reset |

### 1.2 Was spurlos verschwindet

Diese Meldungen existieren nach dem Versand nirgends mehr — kein DB-Feld, keine Ansicht:

- Kontrolle bestätigt / abgelehnt / zurückgezogen (`kontrolleService.ts:47-53`)
- Kontroll-Mahnung und Auto-Buchung (`inspectionEscalationService.ts:37-43`, `:101-105`)
- Sperrzeit- und Anforderungs-Änderungen (`verschlussAnforderungService.ts:298-300`, `:434-438`)
- Alle Rückzüge (`verschlussAnforderungService.ts:479`, `:523`, `orgasmusAnforderungService.ts:111`, `:129`)
- **Strafe verhängt — inklusive Straftext** (`api/admin/strafe/route.ts:72`, `strafurteilService.ts:163`)
- Alle Aufgaben-Änderungen, -Rückzüge und -Ergebnisse (`taskService.ts:275`, `:299`, `:384-395`)

Der Straftext ist der härteste Fall: `emails.penaltyMessage` interpoliert `{reason}`, aber der Sub hat
**keine Seite**, auf der `StrafeRecord.reason` steht — das Strafbuch ist admin-only. Verpasst er die
Mail, erfährt er nie, wofür er bestraft wurde.

Zweite Klasse: Texte, die nur sichtbar sind, **solange die Direktive lebt**. Anforderungs-Nachricht
und Kontroll-Kommentar stehen im Banner (`KontrolleBanner.tsx:69,87`, `LockRequestBanner.tsx:124`) und
verschwinden mit ihm, weil das Dashboard ausschliesslich **offene** Direktiven lädt
(`dashboard/page.tsx:59,63,64,69`).

### 1.3 Die Sackgassen in der Gegenrichtung

- `Task.completionNote` (v5) wird vom Sub geschrieben und löst **keine** Benachrichtigung aus
  (`taskService.ts:317-337`). Der Keyholder sieht sie nur, wenn er die Aufgabenseite öffnet.
- `KeyholderNote` und `KeyholderActionLog` (`schema.prisma:155-206`) existieren ausschliesslich für
  den MCP — **ohne jede Weboberfläche**. Der `KeyholderActionLog` ist das vollständigste Audit-Log im
  Schema und für niemanden sichtbar.
- `NotificationPreference` steuert **nur** die Meldungen über Sub-Einträge an die Keyholder
  (`entries/route.ts:318-319`). Der gesamte Keyholder→Sub-Verkehr läuft daran vorbei: `notifyUser`
  fragt keine Präferenz ab. **Der Sub hat keinen Ausschalter.**

### 1.4 Das Badge ist eine Konstante

`public/sw.js:100-101` setzt `setAppBadge(1)`, das APNs-Payload setzt `badge: 1`
(`src/lib/push.ts:60`). Zehn Meldungen ergeben 1. Geräumt wird nur im Service Worker beim
Notification-Klick (`sw.js:110-113`) — den nativen Pfad (Capacitor/iOS) durchläuft der SW nicht,
`NativePushRouter.tsx:24-30` navigiert nur. **Nativ bleibt die 1 dauerhaft stehen.**

Ein Payload ohne `badge`-Feld lässt das bestehende Badge unverändert — das ist der Grund, warum es
nie wieder verschwindet.

### 1.5 Was schon persistiert wird

Die Inhalte liegen fast alle in der Datenbank: `KontrollAnforderung`, `VerschlussAnforderung`,
`OrgasmusAnforderung`, `StrafeRecord`, `Task`, `Entry.note`, `KeyholderNote`, `KeyholderActionLog` —
jeweils mit Text und Zeitstempeln. **Es fehlt die Nachrichten-Sicht darauf, nicht die Daten.**

Nicht persistiert wird ausschliesslich: der versendete Meldungstext selbst, der Versandzeitpunkt der
`notifyUser`-Meldungen, der Zustellstatus und ein Gelesen-Kennzeichen.

---

## 2. Anzeige mit Gelesen/Offen

### 2.1 Wo der Posteingang lebt

**Sub — Glocke im Header, nicht in der Bottom-Nav.**
`BottomNav.tsx:31-37` hat bei Keyholder-Rolle bereits fünf `flex-1`-Slots in `h-16`; auf 390 px sind
das ~78 px je Slot, das Label ist `text-[10px]`. Ein sechster bricht um. Der Header hat den Slot
dagegen fertig: `Header.tsx:31-41` rendert Feedback-Knopf und Avatar in einer Flex-Zeile,
`FeedbackButton.tsx:36-43` definiert die Icon-Knopf-Konvention. Der Header ist `sticky` und im Layout
(`dashboard/layout.tsx:59`), also auf jeder Sub-Seite sichtbar, und bereits eine async
Server-Komponente mit `await auth()` — der Ungelesen-Zähler kommt ohne Client-Fetch.
Zweitplatzierung: `DesktopSidebar.tsx:30-35` hat vertikal Luft.

**Keyholder — vierter Eintrag in `adminNavItems()`** (`src/lib/adminNavItems.ts:20-29`), bereichsweit
über alle Subs, mit Sub-Filter in der Liste. **Nicht** als zehnter Reiter in `UserSubNav.tsx:18-28` —
die Navigation hat schon neun und degradiert mobil zu einem `<select>`.

Der Zähler gehört in den **Renderer**, nicht in `adminNavItems()`: die Liste ist heute rein und
ikonenbasiert und wird von zwei Navigationen geteilt.

### 2.2 Die Zeile

Container `DashboardBlock` → `Card padding="none"` → `<ul className="divide-y divide-border-subtle">`.
Für die Zeile bietet sich `ExpandRow` an, minimal erweitert um Slots für Icon und Zusatz sowie
`min-w-0` auf dem Textblock — eine zweite, fast gleiche Zeilenkomponente wäre genau die Duplikation,
vor der `ExpandToggle.tsx` in seinem eigenen Kommentar warnt.

Ungelesen wird **dreifach** codiert: Punkt, Fettschrift und `sr-only`-Text. Farbe allein ist in vier
Themes und für Farbfehlsichtige keine Information — dasselbe Vorgehen wie in `TaskCard.tsx:94-96`.

**Vorsicht mit `Badge`:** die Komponente ist `whitespace-nowrap` (`Badge.tsx:44`). In einer Zeile mit
frei vergebenem Nutzertext läuft sie auf 390 px über — `TaskCard.tsx:78-79` dokumentiert genau
diesen Vorfall. Also `shrink-0` und der Betreff `min-w-0`, oder das Badge erst im aufgeklappten
Zustand.

Freitexte werden **nie** mit `truncate` gekürzt, sondern `line-clamp-2` in der Liste und ungekürzt im
aufgeklappten Zustand. Ein `truncate` auf dem Straftext schnitte genau die Begründung ab, wegen der
es den Posteingang gibt.

### 2.3 Was „gelesen" bedeutet

> **Gelesen wird eine Nachricht nur durch das Öffnen der einzelnen Nachricht.**
> Nicht durch Öffnen der Liste, nicht durch Scrollen, nicht durch den Push-Tap.

Begründung: Ein Teil dieser Nachrichten löst **Pflichten mit Fristen** aus. „Gelesen" ist damit keine
Bequemlichkeitsanzeige, sondern eine Behauptung mit Konsequenz — der Keyholder liest sie als „hat es
gesehen". Ein Listenaufruf, der zwölf Nachrichten stumm quittiert, produziert eine Behauptung, die
hinterher niemand halten kann.

Dazu:
- **„Alle als gelesen markieren"** als bewusste Handlung mit `ActionModal`-Rückfrage.
- **„Wieder als ungelesen"** je Zeile — ohne das ist ein Fehlklick unwiderruflich.
- **Kein Auto-Read über den Push-Tap:** der landet direkt im Erfassungsformular (`sw.js:116`,
  `NativePushRouter.tsx:24-30`), die Nachricht selbst hat der Nutzer dabei nie gesehen.
- **„Gelesen" ist nicht „erledigt".** Eine gelesene, unerfüllte Kontrolle behält ihre Zustandszeile.

### 2.4 Grenze zu den bestehenden Bannern

> **Das Banner beantwortet „Was muss ich JETZT tun?" — der Posteingang „Was wurde mir GESAGT?".**

Diese Grenze existiert im Code bereits, sie ist nur nicht benannt: Das Dashboard lädt ausschliesslich
offene Direktiven und ist damit **per Abfrage** eine Zustandsanzeige, kein Verlauf. Genau deshalb ist
es blind für alles, was einen Zustand *beendet*.

Daraus folgen vier Regeln:

1. **Der Posteingang steht nicht auf dem Dashboard.** Kein zusätzlicher Block, keine „letzte
   Nachrichten"-Karte — sonst liest man dasselbe zweimal untereinander.
2. **Keine Dringlichkeits-Sprache im Posteingang.** Countdown und „jetzt erfassen" gehören dem
   Banner; der Posteingang bekommt einen neutralen Sprung-Link.
3. **Der Mehrwert bei einer offenen Direktive ist der Text, nicht der Zustand.**
4. **Eine Nachricht verschwindet nie**, wenn ihr Banner verschwindet. Das ist der Unterschied.

### 2.5 Das Badge geradeziehen

- Die Zahl muss **serverberechnet** in beide Payloads: `aps.badge = unread` und `unread` im
  Web-Push-JSON. `sw.js` setzt dann `setAppBadge(data.unread)` bzw. räumt bei 0.
- **Räumen darf nicht am Klick hängen, sondern am Zustand:** bei App-Start, bei jedem Resume und nach
  jedem Lesevorgang neu setzen.
- Der Plattform-Zugriff gehört gekapselt nach `src/lib/swMessages.ts` — dort gilt die Regel, dass
  jeder solche Zugriff dorthin gehört, weil `navigator.serviceWorker` in der iOS-WKWebView und in
  Privatfenstern fehlt und ein ungeschützter Zugriff die umgebende Aktion mitverschluckt.
- **Ehrlichkeitsregel:** Das Badge zählt **ungelesene Nachrichten**, nicht offene Pflichten. Beides in
  eine Zahl zu mischen macht sie wertlos — sie stünde auf 0, während eine Kontrolle läuft.

---

## 3. Datenmodell

### 3.1 Ein Modell, zwei sich ausschliessende Inhaltsfelder

Die Kernfrage ist die Trennung „i18n-Schlüssel + Parameter" gegen „Freitext". Die Antwort steht im
Repo schon bei den Fehler-Codes (`src/lib/serviceResult.ts:12-14`): ein Feld, in dem manchmal ein
Schlüssel und manchmal Prosa steht, ist dieselbe Kategorienverwechslung.

```prisma
model Message {
  id            String   @id @default(cuid())
  // Der Sub, um den es geht — IMMER der Scope-Schlüssel. Damit ist der Rechte-Check exakt der
  // bestehende requireKeyholderOrAdminApi(), und es entsteht kein zweiter Sichtbarkeits-Pfad.
  subjectUserId String
  subject       User     @relation("MessageSubject", fields: [subjectUserId], references: [id], onDelete: Cascade)

  // Wer getippt hat: "sub" | "keyholder" | "ai" | "system" — Vorbild StrafeRecord.judgedBy
  senderKind    String
  senderUserId  String?
  sender        User?    @relation("MessageSender", fields: [senderUserId], references: [id], onDelete: SetNull)
  // Ob der Inhalt vom Menschen stammt oder vom Agenten geschlossen ist:
  // "user-stated" | "agent" — identisch zu KeyholderActionLog.source
  decisionSource String?

  // "sub" = an den Sub · "keyholders" = an dessen Keyholder
  audience      String

  // GENAU EINES der beiden Paare ist gesetzt:
  // (a) Maschinen-Inhalt — wird in der Sprache des LESERS gerendert
  bodyKey       String?
  bodyParams    String?   // JSON als String; SQLite kennt kein Json-Feld
  // (b) Menschen-Inhalt — nie übersetzt, nie interpoliert
  body          String?

  // Bezug aufs Tracking-Objekt, Muster von NoteRef (schema.prisma:211-222)
  refEntityType String?
  refEntityId   String?

  createdAt       DateTime  @default(now())
  clientCreatedAt DateTime?  // Offline erfasst: Client-Zeit neben Server-Zeit
  clientMessageId String?   @unique  // Idempotenz gegen doppelte Zustellung aus der Warteschlange

  reads MessageRead[]

  @@index([subjectUserId, createdAt])
  @@index([subjectUserId, audience, createdAt])
  @@index([refEntityType, refEntityId])
}

model MessageRead {
  id             String   @id @default(cuid())
  messageId      String
  message        Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  readAt         DateTime @default(now())
  acknowledgedAt DateTime?   // bewusstes „gelesen und verstanden" — KEINE Erfüllung, siehe 5.3
  @@unique([messageId, userId])
  @@index([userId, readAt])
}
```

Warum das trägt:

- **Gemeinsam** sind Empfänger, Zeit, Bezug, Lesestatus, Reihenfolge — deshalb *ein* Modell.
- **Verschieden** ist nur die Render-Regel, und die hängt an der Feld-Identität statt an einem Flag,
  das man vergessen kann: `bodyKey !== null` ⇒ übersetzen, `body !== null` ⇒ escapen und roh zeigen.
- `bodyKey` bekommt einen Union-Typ mit Test, der für jeden Schlüssel einen Eintrag in **beiden**
  Sprachdateien erzwingt — dasselbe Muster wie `src/lib/entryErrors.test.ts`.
- Erst diese Trennung macht die Aufräumregel formulierbar: **Systemmeldungen verfallen, Menschentext
  nie** (siehe 5.4).

Ein DB-Constraint „genau eines von beiden" kennt SQLite nicht; das gehört in zwei Factory-Funktionen,
sodass es keinen Aufrufer gibt, der beides setzen könnte.

### 3.2 Bestehende Freitexte: verlinken, nicht spiegeln

| Option | Vorteil | Nachteil |
|---|---|---|
| Überführen | eine Wahrheit | bricht Banner und MCP-Argumente; Feldwegfall ⇒ **schemaVersion-Bumps** an drei Tools |
| Spiegeln | einfachste Umsetzung | zwei Wahrheiten. `edit_lock_request` kann die Nachricht nachträglich ändern — die Kopie ist ab dann falsch |
| **Verlinken** | eine Wahrheit; Korrekturen wirken rückwirkend richtig | Anzeige braucht einen Join und muss fehlende Referenzen vertragen |

**Empfehlung: verlinken** über `refEntityType`/`refEntityId`. Drei Belege aus dem Bestand:

- `Task` speichert bewusst **keinen** Zustand, sondern leitet ihn ab (`schema.prisma:643-646`) — eine
  Textkopie widerspräche dieser Hauskultur direkt.
- Für „Wahrheit doppelt gespeichert, dann auseinandergelaufen" trägt das Schema schon eine Narbe:
  `VerschlussAnforderung.endedReason` (`schema.prisma:358-364`).
- Für nicht auflösbare Referenzen gibt es bereits ein Muster: `unknownRef` in `src/lib/mcp/notes.ts:69`.

---

## 4. Rollen, Rechte und die KI

### 4.1 Wer wem schreiben darf

| Absender | Ziel | Guard |
|---|---|---|
| Sub | eigener Thread | `requireApi()`, `subjectUserId` aus der Session — **nie** aus Query oder Body |
| Keyholder / Admin | Thread eines Subs | `requireKeyholderOrAdminApi(subId)` |
| KI (MCP) | Thread des MCP-Subs | `checkMcpKeyholder`, Ziel bleibt env-fixiert |

Der Thread ist **je Sub, geteilt unter allen seinen Keyholdern** — die einzige Variante, die zu
`getControllersOfUser` passt. Konsequenz, die man aussprechen muss: **der Sub kann nicht gezielt an
einen bestimmten Keyholder schreiben.**

**Achtung bei der Empfängerliste:** `getControllersOfUser` (`keyholder.ts:106-118`) nimmt *alle*
globalen Admins ohne Scoping — bewusst, damit ein Instanz-Betreiber volle Sicht behält. Für
Ereignis-Benachrichtigungen ist das vertretbar; für einen Nachrichten-Thread hiesse es, dass jeder
Instanz-Admin mitliest. **Empfehlung: für Nachrichten die engere `getKeyholdersOfUser` verwenden** und
eine mögliche Mitlese-Situation in der Oberfläche benennen. Ein Kanal, dessen Publikum der Nutzer
nicht kennt, ist schlimmer als keiner.

**Sub ohne Keyholder:** Kanal ausblenden, **kein** Rückfall auf „alle Admins". Der häufigste Fall ist
der Selbst-Hoster in Personalunion — der schriebe sonst an sich selbst, also genau die
Selbst-Kontrolle, die `isKeyholderOf` (`keyholder.ts:11-12`) bewusst verbietet. Systemmeldungen an den
Sub bleiben davon unberührt.

**IDOR:** Nie `findUnique({ where: { id } })`, immer `findFirst({ where: { id, subjectUserId } })`, und
`subId` als **Pflicht**parameter der Service-Signatur — die Regel steht wörtlich in
`taskService.ts:247-248` und wird dort per Test erzwungen.

### 4.2 Die KI als eigene Absenderin

Die Unterscheidung existiert im Schema bereits zweimal: `StrafeRecord.judgedBy` (`ai`/`admin`/`system`)
und `KeyholderActionLog.source` (`agent`/`user-stated`). Das sind **zwei Achsen** — wer getippt hat und
woher die Autorität stammt — und sie dürfen nicht verschmolzen werden. Für den Sub gilt: festes Label
an der Nachricht, **kein** Opt-out. Die App verheimlicht die KI nicht; sie als Menschen auftreten zu
lassen bräche mit dem etablierten Umgang.

**MCP-Tools: zwei, nicht fünf.** `send_message` über das V2-Write-Framework (Pflicht-`reason`, `dryRun`,
Transaktion) und `read_messages` als Read-Tool mit `schemaVersion: 1`. Ohne das zweite antwortet die KI
ins Leere. **Nicht bauen:** `delete_message` (widerspricht dem Supersession-Prinzip), `edit_message`,
`mark_read` (Gelesen ist ein Zustand des Subs).

`keyholder_dashboard` bekommt additiv einen Zähler unbeantworteter Nachrichten — **rein additiv, also
kein Bump**. Nachrichten dürfen dagegen **nicht** in `timeline` oder `get_action_log` eingemischt
werden: das änderte die Semantik bestehender Felder in zwei viel benutzten Tools und zöge zwei Bumps
nach sich.

### 4.3 Die Regel, die man nicht vergessen darf

> **Eine Nachricht darf niemals eine terminierte Direktive verraten.**

Der Bestand hält diese Zusage an zwei Stellen mühsam: `isHiddenFromSub()`
(`src/lib/delayedTrigger.ts:37-39`) und die `NO_SCHEDULE_DISCLOSURE`-Klausel in den Tool-Beschreibungen.
Ein freier Textkanal ist der bequemste Weg, sie zu umgehen — die KI muss den Zeitpunkt nicht einmal
nennen, ein „mach dich schon mal bereit" reicht.

`send_message` muss dieselbe Klausel tragen, **und** die Anzeige einer Nachricht mit Referenz auf eine
noch nicht ausgelöste Direktive muss serverseitig durch `isHiddenFromSub()` gefiltert werden — nicht
nur durch die Tool-Dokumentation. Das ist der teuerste Fehler, den dieses Feature machen kann.

---

## 5. Risiken

### 5.1 Benachrichtigungs-Sturm

Zwei Multiplikatoren: die Empfängerliste (alle Admins plus alle Keyholder, jeweils per `Promise.all`
angeschrieben) und die fehlende Präferenz-Prüfung in `notifyUser`.

**Empfehlung:** `NOTIFICATION_EVENT_TYPES` (`constants.ts:215`) um `MESSAGE_RECEIVED` erweitern und
`NotifyContent` ein optionales `eventType` geben. Dann gilt: **Nachricht immer schreiben, Mail/Push nur
wenn erlaubt.** Das ist der eigentliche Gewinn der Persistenz — der Kanal wird *leiser*, nicht lauter,
weil man Push abschalten kann, ohne die Information zu verlieren.

Nebenbefund: `NotificationPreference` liegt am Sub, steuert aber die Meldungen an die Keyholder. Für
Nachrichten muss die Empfänger-Präferenz am Empfänger hängen.

### 5.2 Poller

Für Etappe 1 braucht es **keinen** Poller — Nachrichten entstehen synchron im Service-Layer. Käme je
ein Block dazu: eigene Tabelle, `take`-Deckel und ein Versand-Stempel. `Task.resultNotifiedAt` existiert
genau deshalb (`schema.prisma:669-671`), und das Fehlen der zugehörigen Stempel-Logik hat in v5 bereits
einmal eine Warteschlange stillgelegt.

### 5.3 Der Kanal darf die Direktiven- und Strafenlogik nicht unterlaufen

Drei Stellen, alle bewusst zu entscheiden:

1. **Eine Nachricht ist keine Meldung.** Der Vergehensbegriff ist objektiv abgeleitet; eine
   Entschuldigung im Kanal ändert im Strafbuch nichts. Das muss die Oberfläche sagen.
2. **Quittieren ist keine Erfüllung.** Sonst umgeht „gelesen und verstanden" den Foto- und Code-Pfad.
   Die Task-Selbstmeldung ist im Schema ausdrücklich *zusätzlich* zur Bedingungserfüllung nötig
   (`schema.prisma:663-666`).
3. **Der Kanal ist keine Direktive.** Wenn die KI „du bleibst bis morgen zu" *schreiben* kann statt
   eine Sperrzeit zu *setzen*, entsteht eine Direktive ohne Datensatz: keine Frist, kein Poller, kein
   Strafbuch, kein Rückzug. Die Tool-Beschreibung muss das verbieten und auf die Direktiven-Tools
   verweisen.

### 5.4 Offline und Datenmenge

`useOfflineQueue` puffert nur den Request-Body und spielt FIFO zurück. Drei Folgen: der Zeitstempel
entsteht erst beim Zustellen (⇒ `clientCreatedAt`), ein Timeout nach erfolgreichem Schreiben sendet
erneut (⇒ `clientMessageId` als Idempotenz-Schlüssel), und ohne Cache ist der Posteingang genau dann
leer, wenn man ihn braucht (⇒ `idb.ts` von Anfang an einplanen).

Aufräumen gehört von Beginn an in den bestehenden UTC-Tageswechsel-Block des Pollers:
**Systemmeldungen nach N Tagen weg, menschliche Nachrichten nie automatisch.**

---

## 6. Verhältnis zu den offenen Issues

**Es gibt keine Absage zu einem Nachrichtenkanal** — das Thema wurde nie verworfen.

| Issue | Deckung |
|---|---|
| **#37** Träger erbittet Aufschluss/Orgasmus | **Fast deckungsgleich**, aber das Issue verlangt ausdrücklich ein eigenes Modell **mit Zustand** (offen/gewährt/abgelehnt) — ein reiner Chat wäre zu wenig |
| **#36** offene Strafen sichtbar | Der Posteingang liefert den **Ort**; die Strafen-Ansicht selbst bleibt eigene Arbeit |
| **#38** Belohnungen · **#40** Punktekonto | Ebenso: der Kanal ist der Ort, an dem Buchungen ankommen und nachlesbar bleiben — ein Feed ersetzt kein Datenmodell |
| **#39** Kontrollfotos als Nachweis | Der Kanal transportiert „Nachweis liegt zur Sichtung vor" plus Entscheid |
| **#22** Gerätewechsel · **#29** Nutzungsdauer nachschärfen | Der Kanal macht die Anordnung nachlesbar; die Wirkung braucht eigene Logik |
| **#42** Frist-Widerspruch in der Kontroll-Mail | **Ausdrücklich nicht** — reiner Textfehler in einer Vorlage. Zuerst separat fixen, sonst nimmt der neue Kanal den Widerspruch mit |
| **#26** Wochenpläne · **#28** Geofencing · **#16** Community-Forum | Nicht durch Nachrichten gelöst; #16 liegt bewusst **ausserhalb** der Instanz |

---

## 7. Etappen

Jede Etappe ist rein additiv — kein bestehendes Feld ändert sich, kein `schemaVersion`-Bump wird nötig.
Bei 26 Instanzen und einem MCP, der historische Werte interpretierbar halten muss, ist das die einzige
Form, die sich in Schritten ausrollen lässt.

| # | Inhalt | Risiko |
|---|---|---|
| **1** | `Message` + `MessageRead`; `notifyUser` schreibt zusätzlich eine Schlüssel-Nachricht; Posteingang für den Sub (nur lesen); `MESSAGE_RECEIVED` in den Präferenzen; Badge serverberechnet | niedrig |
| **2** | Antwort und Rückfrage des Subs mit Objektbezug; Keyholder-Ansicht; Quittieren; Idempotenz und Offline-Cache | mittel |
| **3** | MCP: `send_message` (V2) + `read_messages`; Zähler additiv im `keyholder_dashboard`; Aufräumregel im Tageswechsel | niedrig |

**Wenn nur eine Sache geht: Etappe 1.** Sie ist die kleinste, ändert **keinen einzigen Aufrufer** —
`NotifyContent` trägt bereits Schlüssel, Parameter und Ziel-URL — und behebt allein den härtesten
Befund: dass der Sub heute nicht nachlesen kann, wofür er bestraft wurde.

---

## 8. Was bewusst nicht gebaut wird

- **Vorlagen als eigenes Modell** — der einzige Nutzer wäre der menschliche Keyholder; die KI
  formuliert selbst. Wenn überhaupt, als Freitext bei den Keyholder-Regeln.
- **Überführung der bestehenden Anforderungs-Freitexte** (siehe 3.2).
- **Löschen von Nachrichten** — Supersession statt Delete, wie im übrigen Modell.
- **Reaktionen, Tipp-Anzeige, verschachtelte Threads.** Ein Sub, ein Thread.
- **Keyholder↔Keyholder-Kanal** — kein Anwendungsfall im Modell.
- **Geplante Nachrichten.** Technisch billig, aber der Sinn der Terminierung ist bei Direktiven die
  Überraschung; bei einer Nachricht ist kein Zweck erkennbar, und der Preis wäre ein weiterer
  Tabellen-Scan im Minutentakt.
- **Anhänge/Fotos** — vorerst nicht. Der Bestand hat einen scharfen Belegbegriff (Bild plus
  Verifikationsstatus plus Geräte-Check). Ein zweiter, ungeprüfter Bildpfad daneben lädt dazu ein, den
  Kontroll-Pfad zu umgehen. Nur mit unmissverständlicher Kennzeichnung, dass ein Bild in einer
  Nachricht **kein Beleg** ist.

---

## 9. Nebenbefunde aus der Analyse

Unabhängig vom Konzept, aber beim Lesen gefunden:

1. **Ein Sub ohne hinterlegte E-Mail erfährt von einer angeforderten Kontrolle über gar keinen Kanal.**
   `sendKontrolleNotification` bricht bei fehlender Adresse ganz oben ab (`kontrolleService.ts:233`),
   der Push steht erst danach (`:280`). Bei Verschluss und Orgasmus ist das korrekt getrennt.
2. **Die Meldungen über Sub-Einträge sind hartkodiert deutsch** (`entries/route.ts:330`, `:344-366`) —
   die einzige Stelle im Projekt, die die Empfänger-Sprache ignoriert. Wenn dieser Pfad ohnehin
   angefasst wird, gehört das mit korrigiert.
3. **`KeyholderActionLog` hat keine Oberfläche.** Das vollständigste Audit-Log im Schema ist nur über
   den MCP sichtbar — für den Sub gar nicht.
