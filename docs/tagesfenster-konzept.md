# Tagesspezifische Fenster

Reinigungsfenster und Kontroll-Fenster gelten nicht mehr an jedem Tag gleich. Ein Träger, dessen
Woche montags anders aussieht als sonntags, bekam vorher eine Regel, die an beiden Tagen falsch war:
weit genug für den vollen Tag, und damit zu weit für den knappen.

## 1. Was verschieden ist — und was nicht

|  | Reinigungsfenster | Kontroll-Fenster |
|---|---|---|
| Form | Liste von `{start, end, days}` | Grundstand + Liste von Ausnahmen |
| Wo | `User.cleaningWindows` (JSON) | `User.autoKontrolleDays` + `User.autoKontrolleDayRules` |
| Mehrere pro Tag | ja, seit jeher | nein, eine Ausnahme je Tag |
| Ein Tag ohne Eintrag | **geschlossen** | Grundstand |

Der letzte Unterschied ist der wichtigste und keine Unachtsamkeit: die beiden Listen bedeuten
Verschiedenes. Die Reinigungsfenster sind eine **Erlaubnis** — was sie nicht abdecken, ist verboten.
Die Ausnahmen der Kontrollen sind eine **Abweichung** — was sie nicht abdecken, folgt weiter dem
Normalfall.

Was beide teilen, ist nur der Wochentag selbst: `weekdays.ts` (Bitmaske, Montag = Bit 0, ISO-Zählung
1–7) und `WeekdayPicker`. Beide Bausteine gab es schon; erster Nutzer waren die Wiege-Fenster.

## 2. Die Entscheide

| Frage | Antwort | Warum |
|---|---|---|
| Reinigung an einem Tag ohne Fenster? | **verboten** | Sonst höbe das Setzen von Wochentagen die Regel an allen übrigen Tagen auf — das Gegenteil dessen, was der Keyholder gerade eingestellt hat |
| Fenster aus der Zeit davor? | gelten täglich | `parseWeekdayMask` liest ein fehlendes `days` als alle sieben. Ein Deploy darf niemandem seine Einstellung ändern |
| Kontrollen: sieben volle Tages-Einstellungen oder Ausnahmen? | Ausnahmen | Der übliche Fall ist „wie immer, ausser dienstags". Sieben Fassungen zwängen dazu, dieselben Zeiten sechsmal abzuschreiben — und jede spätere Änderung am Normalfall wäre eine an sechs Stellen |
| Mehrere Auslöse-Fenster pro Tag? | nein | Der Planer rechnet mit genau einem. Eine Liste zwänge `spreadOverDay`/`fillFreeGaps` auf eine Vereinigung von Intervallen — viel Umbau an der Zufalls- und DST-Arithmetik für einen Fall, den bisher niemand hatte |
| Ruhetag als 24-Stunden-Schlaf-Fenster? | nein, eigenes Feld | `RuheVon == RuheBis` liest der Planer als „kein Schlaf". Ein ganztägiger Ruhetag wäre über die Von/Bis-Spalten gar nicht sagbar |
| Ruhetag ohne Tage (Maske `0`)? | abgelehnt | Das wäre eine zweite, stille Art, die Automatik abzuschalten. Dafür gibt es `aktiv` — und `active: true` bei null Tagen läse sich in `get_context` wie ein Defekt |

## 3. Warum der Planer unberührt bleibt

Die Kontroll-Arithmetik ist der heikelste Code dieses Bereichs: Wach-Fenster als Komplement des
Schlaf-Fensters, gleich grosse Segmente je Slot, eine Minuten-Achse mit Anker am Wach-Beginn (damit
die Umstellungstage nicht eine Stunde verrutschen), das Kappen der Frist am nächsten Schlaf-Beginn.

Sie bleibt Zeichen für Zeichen, wie sie war. Der Hebel ist, dass der Planer **immer nur einen Tag**
plant:

```
ensureDailyAutoKontrollenForUser / rerollTodayAutoKontrollenForUser
        │
        ├── settingsForDay(settings, now, tz)   ← die EINE Stelle, an der ein Wochentag zählt
        │        ├── Automatik aus?      → null
        │        ├── Ruhetag?            → null
        │        └── Ausnahme des Tages  → Zeiten ersetzt
        │
        └── generateAutoKontrollen / fillFreeGaps   ← sieht weiterhin EIN Schlaf- und EIN Fenster
```

`settingsForDay` beantwortet beide Fragen zusammen — „wird heute geplant" und „mit welchen Zeiten".
Getrennt gestellt wäre der Ruhetag genau die Prüfung, die an einem der zwei Einstiegspunkte fehlt und
dort still weiterplant.

Beim Neuwurf greift der Ruhetag **nach** dem Löschen: wer den Sonntag gerade freigestellt hat, will
die schon gewürfelten Sonntags-Kontrollen los sein, nicht bloss keine neuen dazubekommen.

Ein Ruhetag setzt **keinen** Tages-Merker. Der Merker hält fest, dass gewürfelt wurde — auch auf
null. Ein Ruhetag wäre davon nicht zu unterscheiden, und er braucht ihn nicht: die Frage stellt sich
im nächsten Poller-Tick genauso schnell neu.

## 4. Was ein Ruhetag NICHT abschaltet

Die Kontrolle nach einem Wiederverschluss, der eine Reinigungspause beendet. Sie ist eine feste
Regel und keine Einstellung: sie antwortet auf eine Handlung des Trägers, nicht auf einen Plan. An
den Ruhetagen mit abgeschaltet hiesse, sich an genau den Tagen selbst öffnen zu können, an denen
niemand hinsieht.

Die **Tages-Ausnahmen** gelten für sie dagegen sehr wohl: schläft der Träger dienstags ab 19 Uhr,
darf ihn auch diese Kontrolle dienstags um 20 Uhr nicht wecken. Deshalb liest `isSleepingAt` die
Ausnahme mit (`timesForDay`), aber nicht den Ruhetag (`settingsForDay`).

## 5. Was der Träger sieht

Unter „Meine Regeln":

- die Reinigungsfenster mit ihren Wochentagen, dazu der Satz, dass ein Tag ohne Fenster geschlossen ist;
- die Plan-Tage der Kontrollen — **nur wenn sie eingeschränkt sind**. „täglich" ist der Normalfall
  und keine Regel, die jemand nachschlagen müsste;
- die Tages-Ausnahmen, sofern es welche gibt.

Im Öffnen-Formular nennt der Hinweis „nächstes Reinigungsfenster" jetzt den Tag, wenn es nicht mehr
heute kommt. Vorher hätte er freitagabends „wieder ab 06:00" gesagt und den Montag gemeint.

## 6. Was die KI-Keyholderin kann

Alles davon, im selben Zweig gebaut (Regel aus `CLAUDE.md`: eine Keyholder-Einstellung ohne
MCP-Schreibweg wird nicht nachgereicht, sie fällt ja niemandem auf).

- `set_cleaning`: `windows[].days` als ISO-Liste (`[1,2]`), fehlt sie, gilt täglich.
- `set_auto_inspections`: `planDays` (Plan-Tage) und `dayRules` (Ausnahmen), beide ersetzen die
  ganze Liste.
- `get_context.autoInspections`: `planDays` als Kürzel-Zeile, `dayRules` als lesbare Zeilen
  („tue quiet 19:00-06:00 window 08:00-12:00").

Abgelehnt wird mit **Stelle**: `dayRules[1] {…}: The trigger window lies entirely inside the sleep
window…` — eine Agentin, die fünf Regeln auf einmal setzt, soll nicht raten müssen, welche stört.
Geprüft wird dabei die umgerechnete Liste, nicht die tolerant geparste: die verwirft eine kaputte
Zeile still, und der Agent bekäme ein `ok` für eine Ausnahme, die nirgends steht.

`get_context` steigt dabei auf `schemaVersion: 4`. `cleaning.windows` ist nicht mehr zwangsläufig
täglich, und eine gespeicherte v3-Antwort liesse sich sonst nicht mehr von einer v4 unterscheiden.

**Die Prüfung des GRUNDSTANDS ist bei der Gelegenheit mitgewandert.** Ob ein festes Auslöse-Fenster
rückwärts läuft oder ganz im Schlaf liegt, fragte bisher nur der MCP — dieselben Uhrzeiten ergaben
also je nach Weg 200 oder 400, und über das Formular gespeichert übersprang der Planer sie stumm.
Jetzt fragt der Dienst, den beide Wege passieren; er tut es aber nur, wenn der Patch eines der vier
Zeit-Felder anfasst, damit eine schon gespeicherte schlechte Kombination nicht auch jede unbeteiligte
Änderung aussperrt.

## 7. Bewusst NICHT gebaut

- **Fenster über Mitternacht** — weiterhin zwei Einträge. Mit Wochentagen wäre zusätzlich zu klären,
  welchem Tag der Teil nach Mitternacht gehört; die Antwort wäre in jeder Anzeige neu zu erklären.
- **Einzelne Kalendertage** („am 24.12. keine Kontrollen"). Ein Wochentag ist eine Regel, ein Datum
  ein Ereignis — dafür gibt es die Sperrzeit und `withdraw`.
- **Ausnahmen für die Anzahl pro Tag oder die Fristen.** Sie ersetzen nur die beiden Fenster-Paare.
  Was noch alles tagesabhängig sein könnte, sollte ein zweiter Anlass zeigen, kein erster Entwurf.
- **Der Zipfel nach Mitternacht gehört dem Vortag.** Reicht das Wach-Fenster über Mitternacht (Schlaf
  etwa 02:00–08:00 ⇒ wach 08:00–26:00), wird ein Slot um 00:30 am Dienstag noch unter der
  MONTAGS-Regel geplant — und er kommt auch dann, wenn der Dienstag ein Ruhetag ist. Der Planer plant
  einen Tag am Stück, und dieser Tag endet nicht um Mitternacht. Den Zipfel abzuschneiden hiesse, das
  Wach-Fenster mitten in der Nacht zu zerteilen; ihn dem Folgetag zuzuschlagen hiesse, zwei Regeln
  in einem Plan zu mischen. Beides ist mehr wert als der Fall — der eine ungewöhnliche
  Schlaf-Fenster-Zuschnitt voraussetzt — kostet. Wer ihn trifft, soll wenigstens hier nachlesen
  können, dass er gemeint ist.
