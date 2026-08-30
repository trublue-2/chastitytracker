# Die Umsetzung — was gebaut ist, was nicht

Der Entwurf steht in [`README.md`](README.md) (dunkel) und [`hell.md`](hell.md) (hell). Diese Datei
beschreibt, was davon **im Code** angekommen ist.

**Der Branch `design/entwurf` ist die neue Version. `main` bleibt unangetastet.** Zum Vergleichen
baut man aus dem einen oder dem anderen Verzeichnis — es ist derselbe Funktionsumfang, nur anders
gestaltet.

## Die Grundregel der Umsetzung

**Kein Token-Name hat sich geändert, nur wohin er zeigt.** `--color-lock` heisst weiter
`--color-lock`; dass er jetzt Rosa statt Grün trägt, sieht keine Komponente. Deshalb ist der
Umbau breit wirksam, ohne 118 Komponenten anzufassen — und deshalb lässt er sich auch wieder
zurücknehmen.

## Was steht

### Die Tokens kommen aus einem Generator

[`tokens.mjs`](tokens.mjs) erzeugt alle drei Welten-Blöcke aus einer Beschreibung.

```bash
node docs/design/tokens.mjs          # ansehen
```

Drei Welten mal rund 100 Tokens sind 360 Werte. Von Hand konsistent zu halten ist genau das, woran
es vorher gescheitert ist: die dunkle Kategorie-Palette stand nur in einem der beiden dunklen
Themes, und der Träger-Dunkelmodus zeigte deshalb helle Chips auf dunklem Grund — in zehn
Komponenten, monatelang, ohne dass es jemandem auffiel.

Abgesichert durch `theme.test.ts`: **jedes Farbtoken des hellen Träger-Themes muss in BEIDEN
dunklen gesetzt sein.** Die Einseitigkeit ist Absicht — `:root` IST das helle Träger-Theme, ein
dunkles erbt von dort sonst einen hellen Wert.

### Acht Bedeutungsfarben sind drei geworden

| Familie | wird | warum |
|---|---|---|
| `lock`, `sperrzeit` | **Rosa** | beides ein Verschluss-Zustand |
| `inspect`, `request`, `warn` | **Koralle** | alles „etwas will jetzt von dir" |
| `ok` | **Gold** | geschafft |
| `unlock`, `orgasm` | **neutral** | eine Eintragsart ist kein Signal |

Der Verlust ist kleiner, als die Zahl acht vermuten lässt: **`lock` und `ok` waren schon vorher
farbgleich** (`#0d9151` hell, `#34d399` dunkel — identisch in allen fünf Tokens), und `inspect`
und `warn` unterschieden sich nur um wenige Prozent Sättigung. Die App hatte faktisch fünf
unterscheidbare Farben, nicht acht.

### Die Rolle sitzt im Grund, nicht im Akzent

Kopfzeile und Navigation waren durchgehend grün (Träger) bzw. indigo (Keyholder) — dieselbe
Tatsache trug in zwei Bereichen zwei Farben. Beide sind jetzt neutrale Flächen; die Rolle zeigt
sich an der Temperatur des Grunds (warm/kühl).

### Der Tragekalender läuft nicht mehr in Blau

Blau bedeutet im Farbsystem `unlock` — ausgerechnet das Gegenteil von „viel getragen". Der
Kalender nutzt jetzt die Helligkeits-Rampe (`--wear-0..4`), und die Tageszahl richtet sich nach
IHRER Zelle (`--wear-N-text`) statt nach dem Grund. Fläche und Ziffer kommen aus derselben Datei,
weil sie nur gemeinsam stimmen.

### Karten und Schatten

`Card` hat Rahmen und Radius aus der Basis verloren — Abschnitte trennen sich durch Haarlinien und
Raum. `Button` trug an vier Stellen `shadow-card`, allein die Hälfte aller Schatten der App; ein
Knopf, der sich von der Seite abhebt, konkurriert mit der einen Stelle, die das je Bildschirm darf.

**Dabei entschärft:** `Card` baute seine semantischen Klassen zusammen
(`` `bg-${semantic}-bg` ``). Tailwind liest den Quelltext statisch und sieht so etwas nie — dass
die 26 semantischen Karten trotzdem Farbe hatten, lag daran, dass dieselben Namen zufällig in
`Pill` und `Badge` wörtlich standen. Wer sie dort entfernt hätte, hätte den Karten still den
Hintergrund genommen. Jetzt eine `Record`-Tabelle, die der Compiler vollständig hält.

### Typo-Skala und Serif

Sechs Stufen im `@theme inline`-Block, benannt nach ihrer **Aufgabe**: `text-zahl`, `text-titel`,
`text-zeile`, `text-fliess`, `text-neben`, `text-rubrik`. Dazu Instrument Serif für Titel.

Der Grund für die Benennung: `text-xs` stand 523-mal und trug gleichzeitig Rubrik, Nebeninfo,
Kennzahl und Fliesstext. Eine dieser vier Rollen zu ändern war unmöglich, ohne die anderen drei
zu treffen. `text-rubrik` lässt sich neu vermessen, `text-xs` nicht.

### Tickende Zahlen springen nicht mehr

`LockPeriodRemaining`, `SessionDurationBadge` und der Aufgaben-Countdown besitzen ihre
tabellarischen Ziffern jetzt selbst. Vorher hing es daran, dass jeder Aufrufer daran dachte —
`SessionDurationBadge` funktionierte nur, weil zufällig alle drei es taten.

### Alle harten Farben sind fort

Ausserhalb der eigenständigen Info-Seite gibt es **keine** hartkodierte Tailwind-Palettenklasse
mehr im App-Code. Das waren 42 Werte auf 31 Zeilen in 12 Dateien, darunter der Farbverlauf der
laufenden Session, der Statusbanner-Zweig „geöffnet" (der Zweig „verschlossen" daneben war längst
getheme't) und die gesamte Kalender-Skala.

## Zwei Entscheidungen, die aus der Umsetzung kamen

**Die grosse Fläche ist eine Tönung geworden, kein Farbblock.** Die Kopfzeile der laufenden
Session war ein gesättigter Verlauf über den halben Bildschirm. Zwei Gründe dagegen, und der
zweite wiegt schwerer: der Entwurf erlaubt je Bildschirm ein grosses farbiges Element, und ein
Verlauf über die halbe Höhe ist keins — er ist der Bildschirm. Vor allem aber ist auf gesättigter
Rose keine Schrift-Hierarchie mehr darstellbar: volle Deckkraft schafft 4,96:1, jede Abstufung
darunter fällt durch (gemessen 3,48:1 für die Beschriftung, 3,79:1 für den Wert). Man kann dort
EINE Lautstärke haben; die App braucht drei.

**Textstufen sind gegen die ungünstigste Fläche kalibriert, nicht gegen den Grund.** Gegen den
Grund gemessen erreichte die leise Stufe 5,0:1 und fiel auf `surface-raised` trotzdem auf 4,32:1
durch — neun Stellen auf einem einzigen Bildschirm. Wer das einzeln flickt, flickt es auf dem
nächsten Bildschirm wieder.

## Wie geprüft wird

Am **gerenderten Bild**, nicht an der Token-Tabelle: ein Kontrast-Abzug über jeden Textknoten der
laufenden Seite, der die tatsächlich aufgeschichtete Hintergrundfarbe nimmt (Verläufe
eingeschlossen) statt der deklarierten.

Stand: Träger-Dashboard **181 Textknoten, 0 Durchfaller** in beiden Fassungen, schwächste Stelle
4,52:1. Die Entwurfs-Blätter prüft [`kontrast.mjs`](kontrast.mjs) mit demselben Verfahren.

Ein Hinweis für den nächsten Durchgang: der Browser liefert für Deckkraft-Modifizierer
`oklab(…)` statt `rgb(…)`. Ein Parser, der die drei Zahlen als RGB liest, meldet Fehler, die es
nicht gibt — deshalb rechnet der Abzug jede Farbe über ein Hilfs-Canvas um, statt sie zu zerlegen.

## Der Fehler, der dabei gemacht wurde — und was daraus folgt

Der erste Anlauf hat die Tokens umgestellt und **die Struktur nicht angefasst**. Ergebnis: derselbe
Bildschirm, neu angemalt. Das ist die naheliegende Falle bei einem Redesign, weil Farbe messbar
ist und Struktur nicht — man optimiert Kontrastwerte und hält das für Fortschritt.

Der Träger-Bildschirm sagte den Zustand **dreimal**, bevor die Zahl kam:

```
LAUFENDE TRAGEZEIT        ← Rubrik
Verschlossen              ← 24 px
DAUER: 3T 10h 12min 46s   ← die Zahl, 20 px, hinter einer Beschriftung
```

Alle drei beantworten dieselbe Frage. Der Entwurf beantwortet sie einmal: ein kleines Wort in der
Zustandsfarbe, darunter die Zahl in 60 px auf dem Grund. **Die Arbeit bestand nicht darin,
etwas umzufärben, sondern zwei von drei Beschriftungen zu löschen und den Kasten wegzunehmen.**

Konkret entfallen:

- die Karte um den Helden (Rahmen, Radius, Schatten, getönter Kopf)
- „LAUFENDE TRAGEZEIT" und „DAUER:" — die Zahl sagt beides
- die Überschrift „Benutzer: <Name>" — sie stand über einem Bildschirm, auf dem der Name ohnehin
  in der Kopfzeile steht, und besetzte den Platz der einen grossen Aussage. Der Block ist aus dem
  Register entfernt; gespeicherte Reihenfolgen vertragen das (`mergeOrder`, Fall 1)
- der dicke Randstreifen am Warn-Kasten: eine Tönung über die volle Breite mit einer Haarlinie
  oben, kein Kasten mit drei Rändern neben der grossen Zahl
- die getrennten Handy- und Desktop-Fassungen des Kopfs — eine zentrierte Anordnung trägt beide

**Zwei Entscheidungen, die erst der gebaute Bildschirm erzwungen hat:**

*Die Sekunde verschwindet ab einer Stunde.* „3T 10h 22min 40s" braucht 16 Stellen und bricht auf
einem 375-px-Schirm zweizeilig um — und eine Zahl, die umbricht, ist keine grosse Zahl mehr,
sondern ein Absatz. Bei drei Tagen trägt die Sekundenstelle ohnehin nichts bei; in der ersten
Stunde ist das Ticken dagegen genau das, was man sehen will. Die Schwelle liegt bei einer Stunde,
weil dort die Stellenzahl springt.

*Die Schriftstufe wächst mit.* `clamp(2.25rem, 11vw, 3.75rem)` statt fester 60 px — der Entwurf
zeigte „5:40:16", unser Format ist seit Etappe A wortteilig und damit deutlich breiter.

## Der erste echte UX-Schritt: Ziele bewerten statt zählen

Bis hierhin war alles Gestaltung — Struktur, Farbe, Typografie. Nichts davon ändert, **was die App
dem Benutzer sagt**. Der erste Schritt, der das tut:

Eine Zielzeile trug „8h 41min / 20h · 43 %". Um 09 Uhr sind 43 % hervorragend, um 22 Uhr ist der
Tag verloren — dieselbe Zahl, zwei völlig verschiedene Lagen. Die App kennt die Uhrzeit und das
Ende des Zeitraums. Sie sagte es nur nicht; der Benutzer musste die Bewertung jedes Mal selbst
machen.

**Der Platz dafür war frei.** Der Balken zeigt den Anteil, die Prozentzahl daneben sagte dasselbe
ein zweites Mal. Die Spalte trägt jetzt die Auskunft:

| Lage | Anzeige | Farbe |
|---|---|---|
| erreicht | „geschafft" | Gold — die Auszeichnung |
| erreichbar mit Luft | „noch 10h 47min" | neutral, kein Signal nötig |
| nur knapp erreichbar | „noch 14h · knapp" | Koralle — es will etwas von dir |
| nicht mehr erreichbar | „23h 30min fehlen" | Koralle |

Die Rohwerte bleiben stehen: sie sind der Beleg für die Auskunft. Sie treten nur zurück.

**Die Herleitung ist eine Subtraktion und steht deshalb in `goalOutlook.ts`, nicht in der Anzeige:**

    Puffer = verbleibende Zeit im Zeitraum − noch fehlende Stunden

Ist er negativ, ist das Ziel rechnerisch nicht mehr erreichbar — auch bei durchgehendem Tragen ab
sofort. Sieben Tests decken die Lagen ab, inklusive des Falls, um den es geht: dieselben 8h41 von
20h sind morgens `ahead` und abends `missed`.

Drei Dinge, die beim Bauen dazukamen:

- **Die Knapp-Schwelle braucht beides, absolut und anteilig.** Eine Stunde Puffer ist bei einem
  Tagesziel knapp und bei einem Jahresziel bedeutungslos; zehn Prozent von 200 fehlenden Stunden
  sind dagegen 20 Stunden und damit nicht knapp. Genommen wird der grössere Wert, gedeckelt auf
  einen halben Tag.
- **Ab einem Tag wird auf volle Stunden gerundet.** „noch 106h 48min" ist für ein Monatsziel eine
  Scheingenauigkeit und bricht ausserdem die Spalte um. Die Minute bleibt beim Tagesziel, wo sie
  über heute entscheidet.
- **Die Restzeit läuft am selben Takt wie die Stunden.** Zwei Intervalle, die sich um
  Millisekunden verschieben, lassen benachbarte Zeilen unterschiedlich springen.

Geprüft nicht nur im Test, sondern **an der laufenden App in allen vier Lagen** — durch Verstellen
des Tagesziels, bis jede Lage einmal auf dem Schirm stand.

## Zurückgenommen: die Rolle gehört in die Umgebung

Der Entwurf verlangt, die Rolle allein über die Temperatur des Grunds zu zeigen und den Akzent
freizuhalten. Seine Begründung: sonst hiesse „verschlossen" beim Träger rosa und beim Keyholder
indigo — dieselbe Tatsache in zwei Farben.

**Der Einwand traf nicht zu.** Die Bedeutungsfarben waren in beiden Rollen schon immer identisch —
`--color-lock` war in jeder Rolle derselbe Wert `#0d9151`, ebenso `warn`, `ok`,
`inspect`. Die Rolle sass nie in der Semantik, sondern immer nur in der UMGEBUNG: Kopfzeile,
Navigation, Hauptknopf. Der Entwurf argumentierte gegen ein Problem, das die App nicht hatte — und
ich bin dem gefolgt und habe ein funktionierendes Signal entfernt.

**Wie schlecht, ist messbar.** ΔE2000 sagt, ob ein Mensch einen Unterschied sieht (unter 2: nie;
2–10: nur im direkten Vergleich; über 10: auf den ersten Blick):

| | ΔE |
|---|---|
| vorher, Kopfzeile grün ↔ indigo | **12,3** |
| vorher, Hauptknopf | **49,8** |
| nur Grund-Temperatur (mein erster Versuch) | **2,9** |
| jetzt, Kopfzeile und Navigation | **10,4** hell · **10,6** dunkel |

Entscheidend ist dabei nicht die Zahl, sondern eine Beobachtung: **man sieht die beiden Bereiche
nie nebeneinander.** Ein Unterschied von 2,9 ist nur im Vergleich erkennbar — und genau so lagen
die Bildschirme auf dem Entwurfsblatt, nebeneinander. Im Betrieb gibt es diese Bedingung nie.

Jetzt gilt beides: die Temperatur des Grunds als leise Schicht, **und** ein Umgebungs-Ton je Rolle
in Kopfzeile und Navigation — dort, weil das die einzigen Flächen sind, die auf jedem Bildschirm
des Bereichs stehen. Der Keyholder-Ton ist Indigo, wie im Entwurf der Schein seines Bildschirms.
Die drei Bedeutungsfarben bleiben in beiden Rollen gleich; das war nie das Problem.

Die Anteile sind gemessen und nicht gegriffen: bei 9 % Tönung liegt der Unterschied bei ΔE ≈ 10,
und die Fläche bleibt mit 1,17 zum Grund eine Tönung statt eines Farbbalkens.

## Die Block-Figur: Rubrik, Haarlinie, Raum

Ein Block ist **keine Karte**. Er besteht aus drei Dingen, und lange gab es davon nur zwei:

1. eine **Rubrik** — Versalien, leise, aber lauter als der Fliesstext darunter (`BlockHeading`
   `tone="block"`: `text-neben text-foreground-muted`),
2. eine **Haarlinie** unmittelbar darunter (`--border`, 6 px unter der Schrift, 12 px bis zum
   Inhalt) — sie liest sich als Unterstreichung der Überschrift, nicht als frei schwebender
   Trenner,
3. **Raum** zu den Nachbarn: `blockStackCls`, also 32 px mobil und 40 px ab `sm`.

Die Linie fehlte, und der Raum war zu knapp. Gemessen am gebauten Stand: **24 px zwischen zwei
Blöcken gegen 42 px Zeilenabstand innerhalb eines Blocks** — die Nähe war umgekehrt, und kein Auge
kann eine Grenze finden, die enger sitzt als der Inhalt, den sie trennt. Daraus folgt die Regel:
**die Grenze muss mindestens doppelt so gross sein wie der grösste Abstand im Block.**

Zwei Linienwerte, streng getrennt — sonst wird die Seite ein Gitter:

| | Token | wo | wie viele |
|---|---|---|---|
| zwischen Blöcken | `--border` | direkt unter der Rubrik | genau eine je Block |
| innerhalb | `--border-subtle` | zwischen gleichwertigen Zeilen | viele, gleichmässig |

Zwei Blöcke tragen bewusst KEINE Rubrik und damit keine Linie: der Zustands-Held und die Alarme.
Der Held steht in 40 px Luft und ist damit sichtbar die eine grosse Sache.

**Eine Fläche ist die Ausnahme.** Sie steht einem einzelnen adressierbaren Objekt in einem Stapel
gleichartiger zu (`CARD_BODY_STRIPED`), einer Fläche, die selbst die Aussage ist
(`variant="semantic"`), und dem Fall, wo eine Umrandung WENIGER bedeutet (`variant="outlined"`,
archivierte Geräte). Alarme behalten ihre Form, weil sie innerhalb der Spalte stehen: eine Tönung
mit Haarlinie oben setzt voraus, dass sie bis an den Rand läuft, und eine, die 16 px vorher aufhört,
ist ein scharfeckiger Farbklotz.

## Was noch nicht steht

- **Die Typo-Skala ist definiert, aber nicht migriert.** Die sechs Stufen existieren; die 468
  produktiven `text-xs`- und 361 `text-sm`-Vorkommen zeigen noch nicht darauf. Das ist Fleissarbeit
  mit einer Entscheidung darin: rund die Hälfte der `text-sm` sind faktisch Listen-Überschriften,
  für die die Skala keine eigene Stufe vorsieht (`text-fliess` + `font-semibold` oder eine siebte
  Stufe).
- **Historienlisten sind noch farbig.** Eine Liste vergangener Einträge zeigt zehnmal dieselbe
  Farbe für „Kontrolle" — Farbe sollte markieren, was JETZT etwas will, nicht welche Art Eintrag
  das war. Die Fundstellen sind erhoben und stehen bereit.
- **Die Serif ist geladen, aber unbenutzt.** Kein Titel nimmt sie bisher.
- **Karten-Nachbauten** in den `loading.tsx`-Skeletten (`Skeleton.tsx` `CardSkeleton` zeichnet
  weiter `rounded-xl border`) haben ihre Rahmen von Hand und wurden von der `Card`-Änderung nicht erfasst.
- **`DashboardStack`, `FormError`/`FormSuccess`, `EntryFormShell`** bauen ihre Flächen selbst und
  brauchen denselben Schnitt wie `Card`. (`StatsCard`, `MonthStats` und `YearHeatmap` sind
  erledigt — die beiden letzten nehmen `Section`.)
- **Weitere Kasten-Nachbauten auf Block-Ebene**, erhoben nach der Umstellung und noch offen:
  `dashboard/TaskList.tsx`, `admin/users/[id]/strafbuch/StrafbuchClient.tsx` (drei Hüllen),
  `admin/CreateDemoUserButton.tsx`, `admin/tasks/TaskProofPicker.tsx` und
  `TaskRequirementPicker.tsx` (zwei weitere Checklisten-Ringe), `dashboard/changelog/UpstreamSection.tsx`.
- **Stapel, die noch nicht auf `blockStackCls` stehen:** `dashboard/settings/SettingsForm.tsx`,
  `dashboard/categories/CategoriesClient.tsx`, `admin/page.tsx`, `admin/kontrollen/page.tsx` samt
  ihren Skeletten. Sie sind in sich stimmig, nur eben mit einem anderen Wert.
- **Die zwölf Kategorie-Farben** sind unverändert. Sie sind eine andere Achse — sie sagen, WELCHE
  Kategorie das ist, nicht was los ist — passen in ihrer Sättigung aber noch nicht zur neuen
  Zurückhaltung.
