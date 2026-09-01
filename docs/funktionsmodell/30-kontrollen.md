# Kontrollen

## Zweck

Eine Kontrolle verlangt vom Sub ein Foto als Nachweis: „zeig mir, dass du drin bist". Sie entsteht
auf drei Wegen — von Hand, aus dem gewürfelten Tagesplan, oder nach einem Wiederverschluss — und
läuft danach durch dieselbe Erfüllungs- und Eskalationslogik.

## Drei Herkünfte

| Herkunft | Wer | Kennzeichen | Hängt am Hauptschalter |
|---|---|---|---|
| manuell | Keyholder (UI / `request_inspection`) | `auto: false` | nein |
| Tagesplan | Automatik | `auto: true` | ja |
| nach Wiederverschluss | Automatik | `cleaningRelock: true` | ja |

Die dritte ist die, die im Betrieb überrascht: sie ist **fest verdrahtet**, keine Einstellung. Nach
jedem selbst erfassten Wiederverschluss, der eine Reinigungspause beendet, folgt eine Kontrolle —
15–45 Minuten später, oder 5–15, wenn Verschluss oder Auslösung ins Schlaf-Fenster fallen. Sie
**ersetzt** die nächste noch nicht zugestellte Auto-Kontrolle des Tages; war keine mehr offen, kommt
sie zusätzlich.

`autoKontrolleNurBeiSperre` gilt für sie **nicht** — nur der Hauptschalter `autoKontrolleAktiv`
schaltet sie ab.

## Ziel: was genau gezeigt werden soll

- beide Zielfelder leer → der KG; verlangt einen aktiven Verschluss.
- `categoryId` → eine Trage-Kategorie („zeig mir den Plug"), erfüllt aus der laufenden Wear-Session.
- zusätzlich `deviceId` → genau dieses Gerät; hat Vorrang vor der Kategorie.

**Je Ziel darf nur eine Kontrolle laufen.** Eine zweite aufs selbe Ziel wird abgelehnt — bei zwei
offenen wäre nicht entscheidbar, welche ein Foto beantwortet. KG und Plug nebeneinander sind normal.
Erfüllt wird nur durch ein Foto desselben Ziels: ein Plug-Foto hakt keine KG-Kontrolle ab.

## Code-Pflicht hängt am Gerät

Ob ein handschriftlicher Code verlangt wird, entscheidet `Device.requireInspectionCode` des
getragenen Geräts — nicht die Kontrolle. Ist er aus, entsteht die Anforderung ohne Code, und die
Erfüllung läuft über die Regel „die eine offene Anforderung" statt über den Code-Vergleich.

Nur der Keyholder darf ihn setzen: er schwächt eine Kontrolle, und ein Sub, der ihn selbst abschalten
kann, kontrolliert sich nicht mehr.

## Der Tagesplan

Der Planer würfelt zur Sub-Mitternacht eine Anzahl aus `[perDayMin, perDayMax]` und verteilt sie über
das **Wach-Fenster** (das Komplement des Schlaf-Fensters). Die Zeilen werden vorab mit
Zukunfts-`wirksamAb` angelegt; der Minuten-Poller stellt sie bei Fälligkeit zu.

Harte Zusagen des Planers:

- Weder Auslösung noch Frist landen je im Schlaf-Fenster.
- Jeder erzeugte Slot hält die volle Mindest-Frist ein. Reicht sie vor dem Schlaf-Beginn nicht mehr,
  entfällt der Slot — lieber keine Kontrolle als eine, die der Sub nicht schaffen kann.
- Slots überlappen sich nicht.
- Die Zeitachse ist am Wach-Beginn verankert, nicht an Mitternacht: sonst verschöbe sich das ganze
  Fenster an den Zeitumstellungstagen um eine Stunde.

Ein optionales festes Auslöse-Fenster (`autoKontrolleFensterVon/Bis`) ersetzt das Wach-Fenster als
Auslösebereich; die Frist darf darüber hinausreichen, wird aber am Schlaf-Beginn gekappt. Ein Fenster,
das vollständig im Schlaf-Fenster liegt, wird beim Speichern **abgelehnt** statt wirkungslos
gespeichert.

Eine Änderung an der Planung würfelt den Rest des heutigen Tages neu; bereits zugestellte Kontrollen
bleiben.

**Ein verspätet gewürfelter Tag bleibt nicht leer — bekommt aber nur seinen Anteil.** Über den
ganzen Tag verteilt wird nur, solange der Auslöse-Bereich noch vollständig bevorsteht, also zur
Mitternacht des Trägers. Stand die Instanz über diese Mitternacht (etwa während eines Updates),
fällt der Wurf mitten in den laufenden Tag: dann wird in die REST-Zeit geplant, an dem Platz vorbei,
der schon belegt ist. Vorher fielen dabei alle Kontrollen weg, deren Zeitpunkt schon vergangen war,
und der Tag galt trotzdem als geplant — der Träger bekam bis Mitternacht keine mehr.

**Die Anzahl richtet sich dann nach der verbleibenden Zeit**, nicht nach dem ganzen Tag: steht noch
ein Viertel des Auslöse-Bereichs bevor, wird auch nur ein Viertel der Tages-Anzahl geplant. Die volle
Anzahl gehört dem ganzen Tag; sie in die letzten Stunden zu drängen, machte aus einem Neustart einen
Schwall. Abgerundet, damit die Abstände nie enger werden als an einem vollen Tag — aber mindestens
eine, solange überhaupt Zeit übrig ist, damit ein spät begonnener Tag nicht an der Rundung verstummt.
Ein Tag, der bewusst auf null Kontrollen gewürfelt wurde, bleibt bei null.

Es ist derselbe Weg, den auch eine geänderte Planungs-Einstellung nimmt: wer in einen laufenden Tag
plant, plant anteilig in seine Rest-Zeit — beim Neuwurf zusätzlich begrenzt durch das, was heute
schon zugestellt wurde. Bietet die Rest-Zeit keinen Platz mehr für die Mindest-Frist, bleibt der Tag
leer; erfunden wird keiner.

## Eskalation

Zwei Stufen, beide standardmässig aus:

1. `inspectionReminderEnabled` — mahnt nach `inspectionReminderDelayMinutes` ab Fristablauf.
2. `inspectionAutoMarkEnabled` — bucht nach `inspectionAutoMarkDelayMinutes` **ab dem Stempel der
   Stufe 1** die Öffnung (KG) bzw. das Ablegen (Trage-Kontrolle).

Stufe 2 zählt ab Stufe 1, nicht ab der Frist. **Ohne Stufe 1 beginnt Stufe 2 nie** — der Stempel ist
der Uhr-Anker, und er wird gesetzt, unabhängig davon, ob die Mahnung den Sub tatsächlich erreicht.

Zwei bewusste Grenzen von Stufe 2:

- Sie hebt **keine Sperrzeit auf**. Sonst räumte ein Versäumnis genau die Konsequenz weg, die es nach
  sich ziehen soll. (Gemeldet 11.07.2026: eine 14-Tage-Sperre verschwand.)
- Eine Reinigungs-Kontrolle, die ins Schlaf-Fenster fällt, mahnt nur — sie bricht die Session nicht
  ab. Verschlafene Minuten sollen keine Trage-Strecke beenden.

Das Vergehen entsteht in jedem Fall, unabhängig von der Eskalation.

## Wirkt auf

- **Strafbuch** — versäumt, abgelehnt, oder automatisch als abgenommen gebucht.
- **Einträge / Sessions** — nur über Stufe 2, die einen echten Eintrag anlegt.
- **Benachrichtigungen** — Zustellung und Mahnung.

## Unterdrückt von

- `autoKontrolleAktiv: false` — alles Automatische, inklusive der Kontrolle nach dem
  Wiederverschluss.
- `autoKontrolleNurBeiSperre` ohne laufende Sperrzeit — nur der Tagesplan.
- Schlaf-Fenster — Auslösung und Frist, nicht aber die verkürzte Reinigungs-Kontrolle.
- Ein Gesundheits-Halt setzt die Direktiven aus.

## Sichtbarkeit für den Sub

Ab `wirksamAb`. Vorher existiert die Kontrolle für ihn nicht. Eine überfällige Kontrolle verschwindet
nie von selbst — sie bleibt offen und wird als überfällig markiert.

## Code

`autoKontrolleService.ts` (Planer, `scheduleCleaningRelockInspection`),
`inspectionEscalationService.ts`, `kontrolleService.ts`, Modell `KontrollAnforderung`.

## Tests

`autoKontrolleService.test.ts`, `autoKontrolleDayPlan.test.ts`, `autoKontrolleSettings.test.ts`,
`cleaningRelockInspection.test.ts`, `kontrolleService.test.ts`, `inspectionTarget.test.ts`,
`inspectionTargetFlow.test.ts`, `inspectionCodeRule.test.ts`,
`inspectionEscalation.predict.test.ts`, `inspectionEscalationNotify.test.ts`,
`inspectionVerificationService.test.ts`, `mcpSetAutoInspections.test.ts`,
`mcpInspectionScope.test.ts`.
