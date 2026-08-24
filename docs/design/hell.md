# Die helle Fassung — Etappe D0

Der Gestaltungs-Entwurf in [`README.md`](README.md) existierte nur dunkel. Diese Datei ergänzt die
hellen Fassungen für beide Rollen. Anschauen: [`vorschau/bauteile-hell.html`](vorschau/bauteile-hell.html),
[`vorschau/dashboard-verschlossen-hell.html`](vorschau/dashboard-verschlossen-hell.html),
[`vorschau/keyholder-uebersicht-hell.html`](vorschau/keyholder-uebersicht-hell.html) — jeweils neben
der dunklen Datei gleichen Namens.

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
  nicht mehr Gold. *(So sind die beiden Bildschirme gebaut.)*
- **C · Bronze auf Gold-Hauch** — Tinte für die Schrift, Gold als Tönung dahinter. Beides zugleich;
  die Regel „keine Karten" biegt sich hier zum Chip.

**Die Entscheidung steht aus.** Sie gehört zu D, nicht zu D0.

## Befunde aus dem Bau der hellen Fassung

Geprüft wurde nicht am Token-Blatt, sondern am gerenderten Bild: ein Kontrast-Abzug über jeden
Textknoten, mit der tatsächlich aufgeschichteten Hintergrundfarbe statt der deklarierten.

1. **Der Entwurf hat eine undokumentierte vierte Textstufe, und sie fällt durch.** `#7d6b73` steht
   an fünf Stellen des dunklen Träger-Bildschirms (Benutzername in der Kopfzeile, „← Zurück"
   zweimal, Fusszeile, Versionsnummer) und erreicht **4,04:1** — unter den 4,5:1, die die
   `README` für ihre Textstufen zusagt. Die helle Fassung spiegelt sie **nicht** mit; die fünf
   Stellen nehmen dort die leise Stufe. **Die dunkle Fassung braucht dieselbe Korrektur**, wenn D
   die Tokens umsetzt.
2. **Fünfmal Gold untereinander.** Die Aufgaben-Liste des Träger-Bildschirms setzt fünf „Erfüllt" in
   Folge in Gold. Die Regel des Entwurfs lautet „selten, deshalb wirksam" — fünf gleiche
   Auszeichnungen in einer Liste sind das Gegenteil. Fällt hell stärker auf, gilt aber für beide
   Fassungen.
3. **Die Zeile eines Subs bricht, sobald eine Sperrzeit dazukommt.** In der Keyholder-Übersicht
   drängt sich „· Sperrzeit bis Sonntag" neben Zustand und Uhrzeit und wirft „Sonntag" auf eine
   zweite Zeile. **Steht schon in der dunklen Fassung** — beim Spiegeln aufgefallen, nicht dabei
   entstanden.

## Die übrigen sechs spiegeln

Die Zuordnung dunkel → hell steht als [`spiegeln.mjs`](spiegeln.mjs) im Ordner — nicht aus
Bequemlichkeit, sondern weil sie die Entscheidung *ist*: wer sie von Hand nachbaut, trifft sie ein
zweites Mal und anders.

```bash
node docs/design/spiegeln.mjs traeger vorschau/statistik.html vorschau/statistik-hell.html
```

**Es bricht ab, statt zu raten.** Die Tabellen decken heute die zwei gebauten Bildschirme ab, nicht
alle neun. Was sie nicht kennen, bliebe sonst dunkel auf hellem Grund stehen — und das Ergebnis
sähe plausibel aus. Also schreibt das Skript gar nichts und listet stattdessen die offenen Werte:

```
vorschau/statistik.html: 6 Werte ohne Zuordnung — NICHT geschrieben.
  #1a1013  #4a1226  #120b0e  #5c4c53
  rgba(255,255,255,0.75)  rgba(255,255,255,0.055)
```

Jede Zeile ist eine Entscheidung, die noch fehlt, keine Panne. Weisse Auflagen sind dabei der
häufigste Fall: sie hellen einen dunklen Grund auf und haben auf einem hellen nichts zu suchen —
sie werden zu **dunklen** Auflagen, nicht weggelassen.

Zwei Dinge kann das Skript dagegen nicht sehen; die prüft man am Bild — beide oben begründet:

1. **Füllungen, die Intensität kodieren, nehmen die Rampe** (Spitze `#c3022d`), nicht die
   Marken-Rose. Eine Füllung und eine 2-px-Marke sehen im Quelltext gleich aus.
2. **Leiser Text auf einer getönten Auflage** muss auf die mittlere Stufe.

Beim Bau der zwei vorhandenen Bildschirme waren das zusammen fünf Stellen.

**Geprüft wird am gerenderten Bild, nicht am Token-Blatt:** ein Kontrast-Abzug über jeden
Textknoten, der die tatsächlich aufgeschichtete Hintergrundfarbe nimmt (`getComputedStyle`) statt
der deklarierten. Genau daran hingen beide Befunde unten — am Token gerechnet war jede Farbe
korrekt. Wenn D die Tokens nach `globals.css` bringt, gehört dieser Abzug als Test dazu; über den
Entwurfs-Dateien wäre er die Probe am falschen Objekt.

## Was hell noch fehlt

- Die übrigen sechs Bildschirme (`dashboard-offen`, `-mit-frist`, `statistik`, `keyholder-sub`)
- Der Gold-Entscheid (A/B/C oben)
- Erfassen-Formulare, Posteingang, Bewegung — fehlen dunkel ebenso
