# Die helle Fassung — Etappe D0

Der Gestaltungs-Entwurf in [`README.md`](README.md) existierte nur dunkel. Diese Datei ergänzt die
hellen Fassungen für beide Rollen. **Jedes Blatt in [`vorschau/`](vorschau/) gibt es jetzt zweimal**
— `name.html` dunkel, `name-hell.html` hell.

**Nichts hiervon ist im Code.** Wie der Rest dieses Ordners: Entwurf, kein Stand.

## Warum das nicht „dieselben Farben auf Weiss" ist

Im Dunkeln trägt jede der drei Bedeutungsfarben ihre Aufgabe allein — sie ist Fläche **und** Text:

| | auf dem dunklen Grund | auf dem hellen Grund |
|---|---|---|
| Rosa `#ff3d68` | 5,9:1 | **3,2:1** |
| Gold `#e8b44a` | 10,6:1 | **1,8:1** |
| Koralle `#ff8a5c` | 8,7:1 | **2,2:1** |

Keine der drei schafft hell die 4,5:1. Sie dunkler zu *machen* hiesse, sie zu ändern. Also bekommen
sie eine zweite Gestalt.

## Die eine Regel, die es nur auf Hell gibt

**Jede Bedeutungsfarbe zerfällt in Fläche und Tinte.**

- **Fläche** — der volle Ton. Füllungen, Marken, Punkte, Icons ab 2 px. Trägt dunklen Text
  (`#3d0518`), nie weissen. Kodiert nie Intensität.
- **Tinte** — gleicher Farbton, gesenkte Helligkeit, **5,9:1**. Alles, was Text ist; alles unter
  2 px; alles Gefüllte mit weisser Schrift.

Die 5,9:1 sind nicht gegriffen: es ist genau der Wert, den Rosa im Dunkeln auf seinem Grund hat.
Die helle Fassung hält damit dasselbe Kontrast-Versprechen wie die dunkle.

| Bedeutung | Fläche | Tinte | weiss auf der Tinte |
|---|---|---|---|
| Rosa — Zustand | `#ff3d68` | `#c3002b` | 6,3:1 |
| Gold — Auszeichnung | `#e8b44a` | `#7f5a10` | 6,2:1 |
| Koralle — Aufmerksamkeit | `#ff8a5c` | `#b23200` | 6,3:1 |

**Der gefüllte Knopf nimmt die Tinte, nicht die Marken-Rose.** Weiss auf `#ff3d68` sind 3,4:1 und
fallen bei 14 px durch.

## Grund und Text

Die Rolle sitzt weiter im Grund — warm für den Träger, kühl für die Keyholderin.

| | Träger (warm) | Keyholder (kühl) |
|---|---|---|
| Grund | `#fcf7f8` | `#f7f8fc` |
| Erhöht | `#f6eef1` | `#eef1f8` |
| Feld | `#f0e5e9` | `#e5eaf3` |
| Haarlinie | `rgba(45,29,38,0.10)` | `rgba(29,33,48,0.09)` |
| Text hoch | `#2d1d26` · 15,1:1 | `#1d2130` · 15,1:1 |
| Text mitte | `#634d55` · 7,3:1 | `#4d5363` · 7,2:1 |
| Text leise | `#7d656d` · 5,0:1 | `#646b7b` · 5,0:1 |
| Rollen-Tinte | — | `#4e45e8` · 5,9:1 |

Die drei Textstufen halten dieselben Verhältnisse wie im Dunkeln (19 · 10,5 · 5,9), auf das
Maximum von Hell heruntergezogen. **Eine vierte, leisere Stufe gibt es nicht** — siehe „Befunde".

## Intensität

Dieselbe Rampe, gespiegelt. Jede Stufe trifft **denselben Kontrast zum Grund** wie ihre dunkle
Entsprechung — 1,08 · 1,35 · 1,93 · 2,68 · 5,9:

```
dunkel     #1a1013  #4a1226  #7a1836  #a11f45  #ff3d68
Träger     #faecef  #f3cfd7  #e8a2b2  #df7b91  #c3022d
Keyholder  #f5edf3  #efd0da  #e5a3b5  #dd7c94  #c3022d
```

Die Richtung dreht sich: im Dunkeln wird „mehr" heller, auf Hell wird „mehr" dunkler. **Die Rampe
endet deshalb auf der Tinte, nicht auf der Marken-Rose** — auf Weiss ist die satte Farbe nicht der
stärkste Punkt, sondern die tiefste. Ein Balken bei 87 % steht in `#c3022d`, nicht in `#ff3d68`;
sonst stünde er heller da als der Balken bei 40 %.

### Die Ziffer richtet sich nach ihrer Zelle

Im Kalender steht Text **auf** der Rampe, nicht daneben. Er kann sich deshalb nicht am Grund
orientieren:

| Zelle | dunkel | hell |
|---|---|---|
| leer | `#9a868e` leise | `#7d656d` leise · 4,8:1 |
| 0 | `#9a868e` leise | `#7d656d` leise · 4,6:1 |
| <25 % | `#c9b7bd` mitte | `#634d55` mitte · 5,4:1 |
| 25–40 % | `#fdf7f8` hoch | `#2d1d26` hoch · 7,8:1 |
| 40–65 % | weiss 75 % | `#3d0518` Schrift auf Fläche · 6,0:1 |
| >65 % | `#3d0518` dunkel | **weiss** · 6,2:1 |

Die beiden Spalten laufen gegenläufig und kippen beide am Ende: dunkel wird die Ziffer heller, bis
die Zelle so hell ist, dass nur noch Dunkel trägt — hell genau umgekehrt.

## Aus dem Leuchten wird eine Tönung

Ein heller Grund kann nicht strahlen — er kann sich nur einfärben. Der radiale Schein hinter der
grossen Zahl wird zur Tönung (`rgba(255,61,104,0.17)` auslaufend gegen den Grund). Die Regel „nur
eine Stelle leuchtet je Bildschirm" gilt unverändert, sie heisst hell nur anders.

## Zwei Fallen, die es nur hell gibt

**1. Auflagen kosten hell echten Kontrast, im Dunkeln fast keinen.** Die leise Textstufe ist gegen
den **Grund** gemessen. Legt man sie auf einen getönten Chip, verliert sie ihren Puffer: `#646b7b`
auf dem Grund sind 5,0:1, auf einer 6-%-Auflage nur noch 4,2:1 — durchgefallen. Dieselbe Konstruktion
im Dunkeln fällt von 5,9 auf 5,7 und merkt nichts davon.

Der Grund ist die Formel: bei einem fast schwarzen Grund (Leuchtdichte ≈ 0,004) beherrscht der
Summand 0,05 das Verhältnis, eine Auflage verschiebt kaum etwas. Bei einem fast weissen Grund
(≈ 0,94) verschiebt dieselbe Auflage real.

→ **Auf einer getönten Auflage gilt die mittlere Stufe, nicht die leise.**

**2. Gold ist der einzige echte Verlust.** Gold ist definitionsgemäss hell; auf 5,9:1 gesenkt ist es
Bronze, und eine Auszeichnung in Bronze liest sich als zweiter Platz. Drei Wege stehen im
Bauteile-Blatt nebeneinander:

- **A · Gold als Plakette** — volle Fläche, dunkler Text darauf (9,0:1). Gold bleibt Gold, kostet
  Platz und ist lauter als die dunkle Fassung.
- **B · Bronze-Tinte** — Struktur unverändert, nur der Ton wandert. Leise und lesbar, aber es ist
  nicht mehr Gold. **← so gebaut, entschieden am 24.08.2026.**
- **C · Bronze auf Gold-Hauch** — Tinte für die Schrift, Gold als Tönung dahinter. Beides zugleich;
  die Regel „keine Karten" biegt sich hier zum Chip.

**Entschieden: B.** Die Struktur bleibt, der Ton wandert. A und C bleiben im Bauteile-Blatt stehen,
damit die Wahl später nachvollziehbar ist statt nur behauptet.

## Befunde — vier, alle in der DUNKLEN Fassung

Geprüft wurde nicht am Token-Blatt, sondern am gerenderten Ergebnis (siehe unten). Alle vier hingen
genau daran: am Token gerechnet war jede einzelne Farbe korrekt. **Alle sind behoben** — in der
dunklen Fassung, denn die helle spiegelt sie ja.

1. **Eine undokumentierte vierte Textstufe.** `#7d6b73` erreicht auf dem Grund **4,04:1** und
   unterschreitet damit die 4,5:1, die die `README` für ihre Textstufen zusagt. Sie stand an fünf
   Stellen des Träger-Dashboards und **zwanzig** im Kalender der Statistik, dazu eine fünfte Stufe
   `#5c4c53` bei **2,42:1**. Alle nehmen jetzt die leise Stufe `#9a868e`, die Kalender-Ziffern die
   Regel aus dem Abschnitt oben. Als *Grafik* darf `#7d6b73` bleiben — Striche brauchen 3:1.
2. **Fünfmal Gold untereinander.** Die Aufgaben-Liste setzte fünf „Erfüllt" in Folge in Gold, gegen
   die eigene Regel „selten, deshalb wirksam". Eine erledigte Routine-Aufgabe ist keine
   Auszeichnung; Häkchen und Wort sind jetzt neutral. Damit steht Gold auf diesem Bildschirm noch
   **an genau einer** Stelle — dem erreichten Tagesziel.
3. **Die Zeile eines Subs bricht, sobald eine Sperrzeit dazukommt.** „· Sperrzeit bis Sonntag"
   drängte sich neben Zustand und Uhrzeit und warf „Sonntag" um. Die Sperrzeit steht jetzt auf einer
   eigenen Zeile — sie ist ohnehin eine zweite Tatsache, nicht ein Zusatz zur ersten.
4. **Ein Blatt wich in seiner Textfarbe ab.** `statistik.html` setzte `#f7f0f2` als Wurzel-Textton,
   alle anderen `#fdf7f8`. Im Dunkeln fällt so etwas nicht auf — beides ist Fast-Weiss. Beim
   Spiegeln wurde daraus ein Loch: der Wert stand in keiner Tabelle, blieb unverändert und war auf
   Weiss mit **1,06:1** unsichtbar. Das ist zugleich der Grund, warum der Riegel des Generators
   heute prüft, ob ein Wert *angefasst* wurde, statt ob er noch *dunkel* ist.

Bewusst nicht behoben: der **gesperrte Knopf** im Bauteile-Blatt (2,99:1). WCAG 1.4.3 nimmt inaktive
Bedienelemente aus, und ein gesperrter Knopf *muss* matt aussehen — er sagt ja gerade, dass hier
nichts zu holen ist. Er ist dafür als `disabled` ausgezeichnet, nicht bloss blass gefärbt; der
Abzug überspringt ihn deshalb.

## Wie die hellen Blätter entstehen

Zwei Skripte, beide im Ordner. Sie sind der Grund, warum die helle Fassung nicht wieder auseinander
läuft — genau die Bauart aus [`../funktionsmodell/`](../funktionsmodell/): Register, Generator, Test.

### `spiegeln.mjs` — die Zuordnung

```bash
node docs/design/spiegeln.mjs traeger   vorschau/statistik.html     vorschau/statistik-hell.html
node docs/design/spiegeln.mjs keyholder vorschau/keyholder-sub.html vorschau/keyholder-sub-hell.html
```

Die Tabellen darin **sind** die Entscheidung; wer ein Blatt von Hand überträgt, trifft sie ein
zweites Mal und anders. Drei Gruppen:

- **VERBUND** — Paare, die einzeln nicht entscheidbar sind. Dieselbe Rose ist an einer Stelle eine
  Marke und an der nächsten eine Füllung, die Intensität bedeutet. Hier stehen der gefüllte Knopf
  (dunkle Schrift auf voller Rose → **weisse** auf der Tinte), die sechs Kalenderzellen und die
  Balkenfüllungen.
- **TRAEGER / KEYHOLDER** — Grund, Flächen, Textstufen, Rampe, Auflagen, Schein.
- **GEMEINSAM** — die drei Bedeutungsfarben als Tinte.

Zwei Dinge stehen bewusst *nicht* drin, weil sie sich selbst regeln: **Tönungen behalten ihre
Farbe** (`rgba(255,61,104,α)` ist auf Schwarz ein dunkles Weinrot und auf Weiss ein blasses Rosa —
beide Male „eine Rose-Tönung"), und die **Marken-Rose bleibt**, solange sie Marke ist: 3,2:1 liegt
über der 3:1-Schranke für Grafik.

Die **weissen Auflagen** sind nicht geschätzt. Für jedes Alpha ist gemessen, welchen Kontrastschritt
es im Dunkeln macht, und das helle Alpha gesucht, das denselben macht — auf Hell braucht es
durchweg etwas mehr (`0.20` weiss → `0.27` dunkel).

**Der Riegel: er bricht ab, statt zu raten.** Geprüft wird nicht „ist noch etwas dunkel?", sondern
**„hat die Tabelle diesen Wert überhaupt angefasst?"**. Der Unterschied ist nicht theoretisch — er
ist Befund 4: ein heller Textton überlebte die Dunkel-Prüfung mühelos und stand danach unsichtbar
auf Weiss. Fehlt eine Zuordnung, schreibt das Skript **gar nichts** und listet die offenen Werte.

### `kontrast.mjs` — die Probe

```bash
node docs/design/kontrast.mjs            # alle Blätter
node docs/design/kontrast.mjs statistik  # nur diese
```

Läuft über jeden Textknoten jedes Blattes und misst gegen den **aufgeschichteten** Grund: jede
durchscheinende Auflage der Elternkette wird übereinandergelegt, nicht nur die nächstliegende
deklarierte Farbe. Verläufe bleiben aussen vor, genau wie im Browser, wo `getComputedStyle` nur
`backgroundColor` liefert.

Warum am Ergebnis und nicht an der Tabelle: **alle vier Befunde hingen daran.** Am Token gerechnet
war jede einzelne Farbe korrekt. Durchgefallen sind Paarungen, die erst beim Aufeinanderschichten
entstehen — und ein Wert, den niemand in der Tabelle stehen hatte.

Stand: **18 Blätter, 0 Durchfaller**, schwächste Stelle 4,52:1.

## Was hell noch fehlt

Nichts an Bildschirmen — jedes Blatt gibt es jetzt in beiden Fassungen. Offen bleibt, was **dunkel
ebenso fehlt**: Erfassen-Formulare samt Fotoaufnahme, Nachrichten und Posteingang, der
Kalender-Kategorie-Umschalter, und Bewegung (was passiert beim Verschliessen, beim Ablauf einer
Frist).

Für **Etappe D** — wenn die Tokens nach `globals.css` wandern — gehört der Abzug aus `kontrast.mjs`
an den echten Stand statt an die Entwurfs-Blätter. Dort ist er die Probe am richtigen Objekt; hier
war er die Probe an einem Vorschlag.
