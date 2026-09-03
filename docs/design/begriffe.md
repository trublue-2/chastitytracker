# Die Begriffe — je Sache ein Wort

Entscheidungstabelle zu Issue #93, Teil von v6.

Der Anlass ist der Satz eines neuen Trägers in seiner zweiten Woche: *„Ich habe zwei Tage
gebraucht, bis ich verstanden hatte, was KG heisst."* Das Issue nennt „fünf Wörter für Zeiträume,
fünf für Vorschriften".

**Die Bestandsaufnahme korrigiert das in zwei Punkten** — beide zugunsten einer kleineren, aber
schärferen Änderung:

1. **„Session" und „Haltefrist" kommen in `messages/de.json` gar nicht vor** (0 Treffer). Sie sind
   Bezeichner im Code, keine Wörter der Oberfläche. Der Träger kann sie nie gelesen haben.
2. **Die übrigen sind teils keine Synonyme, sondern verschiedene Sachen mit ähnlich klingenden
   Namen.** Das ist der eigentliche Schaden: nicht fünf Wörter für eins, sondern vier Sachen, deren
   Wörter nicht sagen, welche gemeint ist.

Daraus folgt die Linie dieses Dokuments: **nicht alles auf ein Wort zusammenziehen, sondern jedem
Wort genau eine Sache geben** — und die Wörter streichen, die keine eigene Sache haben.

---

## 1. Das Gerät — „KG“ bleibt, wird aber aufgelöst

**Befund.** 28 sichtbare Stellen sagen „KG“, ohne es je aufzulösen. Die englische Seite ist
schlimmer: `KG` 7×, `CB` 8×, `chastity` 7×, `device` 64× — **vier** Namen für eine Sache.

**Entscheidung (trublue, 27.08.2026).** Der erste Entwurf wollte die Abkürzung ersatzlos streichen
und durch „Gerät“ ersetzen. Verworfen: sie ist unter Nutzern eingeführt, und der Ersatz wäre
kühl — „Welches Gerät trägst du?“ klingt nach Inventar. Stattdessen:

- **„KG“ bleibt in der Oberfläche** — die 26 Fundstellen werden NICHT umgeschrieben.
- **Aufgelöst wird es genau einmal, auf `/dashboard/regeln`.** Das ist laut dem Prüfer die einzige
  Seite, auf der steht, wonach der Träger beurteilt wird — also der Ort, den ein neuer Nutzer
  ohnehin aufschlägt, wenn er etwas nicht versteht. Ein Satz, kein Glossar.
- **Die englische Seite verliert `CB`.** Zwei Abkürzungen für dieselbe Sache sind eine zu viel; wo
  `CB` steht, steht künftig `KG` oder gar nichts.

### Die eingebaute Kategorie heisst „Chastity Device“

Der Datenbank-Wert `"KG"` ist **nicht** unsichtbar, wie der erste Entwurf annahm:
`CategoryGoalsLive.tsx:91` rendert eine hart hinterlegte Beschriftung als NAMEN, direkt neben
Kategorien, die ihren Namen aus der Datenbank holen.

**Entscheidung: beides umstellen, per Migration, auf `"Chastity Device"`.**

Warum ausgerechnet dieser Wert — und warum englisch, obwohl die Oberfläche deutsch ist: Der
Unterschied dieser Kategorie zu allen anderen liegt nicht im Ding, sondern in dem, **was erfasst
wird**. Alles liegt in derselben Tabelle (`Entry`), getrennt allein durch den Typ:

| Kategorie | Typen | Bedeutung |
|---|---|---|
| die eingebaute | `VERSCHLUSS` / `OEFFNEN` | **eingeschlossen** und wieder geöffnet |
| alle anderen | `WEAR_BEGIN` / `WEAR_END` | **getragen**, von–bis (`deviceId` ist Pflicht) |

`KG_ENTRY_TYPES` und `WEAR_ENTRY_TYPES` (`lib/constants.ts`) halten das auseinander, und es gibt
eine eigene Fehlermeldung dafür. Die anderen Kategorien werden getragen — diese eine schliesst
ein. Der Name muss also die Sache benennen, nicht die Bauform: „Belt“ wäre für Käfig-Träger
falsch, „Cage“ für Gürtel-Träger, und die Migration kann nicht wissen, wer was trägt. Englisch,
weil neue Bezeichner in diesem Projekt englisch sind und der Produktname das Wort ohnehin führt.

**Die Migration darf keine fremde Wahl überschreiben.** Sie fasst den Bestand von 26 Instanzen an;
umbenannt wird nur, was noch exakt `"KG"` heisst — wer die Kategorie längst selbst benannt hat,
behält seinen Namen.

### Und der App-Name

Der Kopf sagte „KG Tracker“, das Produkt heisst „Chastity Tracker“. Ab v6 sagen beide dasselbe.
Der Umbruch auf schmalen Bildschirmen ist dabei neu zu prüfen — der längere Name war der Grund,
warum der Kopf diese Woche überhaupt angefasst wurde.

## 2. Zeiträume — vier Sachen, vier Wörter

**Befund.** Sichtbar sind: `Tragezeit` 35×, `Verschluss` 36×, `Sperrzeit` 36×, `Frist` 42×.

Das sind **keine** Synonyme:

| Sache | Wort | Was es ist |
|---|---|---|
| Der gemessene Zeitraum vom Anlegen bis zum Ablegen | **Tragezeit** | Beobachtung. Wird gezählt, nicht angeordnet. |
| Der Zustand jetzt | **verschlossen / offen** | Kein Zeitraum. Seit v6 sagt ihn zusätzlich die Farbe. |
| Ein angeordneter Zeitraum mit Ende | **Sperrzeit** | Anordnung der Keyholderin. Hat ein Ende, das der Träger kennt. |
| Der Zeitpunkt, bis zu dem etwas zu tun ist | **Frist** | Gehört einer Forderung, nicht einem Zustand. |

**Entscheidung (trublue, 27.08.2026).** Alle vier bleiben — sie benennen vier verschiedene Dinge.

Der Einwand gegen den ersten Entwurf: „Sperrzeit“ durch „eingeschlossen bis …“ zu ersetzen
verliert etwas. **Eine Sperrzeit ist verbindlich — sie zu brechen ist ein Vergehen.** Das ist der
Unterschied zur Tragezeit, die nur gezählt wird.

Damit bleibt zwar bestehen, dass beide „-zeit“-Wörter sind. Gelöst wird das nicht durch
Umbenennen, sondern indem **die Folge überall danebensteht, wo eine Sperrzeit erscheint**:

> Sperrzeit bis Sonntag 20:00 — früher öffnen wird als Vergehen erfasst.

Der Träger im Issue wusste nicht, „welches davon endet, wenn er öffnet“. Die Antwort steht danach
im Text und nicht im Wortende: die **Tragezeit** endet, die **Sperrzeit** wird gebrochen.

Was zusätzlich geht, ist das fünfte Wort:

> **„Verschluss" als Hauptwort für einen Zeitraum fällt weg.** Es bleibt ausschliesslich Zustand
> und Tätigkeit: *verschlossen sein*, *verschliessen*. Wo heute „der Verschluss" einen Zeitraum
> meint, steht künftig „die Tragezeit".

Das ist die Stelle, an der der Träger im Issue hängenblieb — er wusste nicht, „welches davon endet,
wenn er öffnet". Antwort nach der Änderung: die **Tragezeit** endet. Die **Sperrzeit** endet nicht,
sie ist die Ansage, wie lange sie hätte laufen sollen.

---

## 3. Vorschriften — drei Sachen, drei Wörter

**Befund.** `Ziel` 38×, `Vorgabe` 29×, `Anforderung` 29×, `Freigabe` 12×, `Trainingsvorgabe` 5×,
`Trainingsziel` 5×.

`Trainingsvorgabe` und `Trainingsziel` bezeichnen **dasselbe Objekt** (`TrainingVorgabe`) mit zwei
Wörtern — das ist die einzige echte Doppelung im Bestand.

| Sache | Wort | Abgrenzung |
|---|---|---|
| Ein Mass, das erreicht werden soll | **Ziel** | Wird gemessen. Verfehlen ist kein Vergehen. |
| Eine Forderung an dich, jetzt, mit Frist | **Anforderung** | Kontrolle, Einschluss, Orgasmus. Verstreichen hat Folgen. |
| Eine Bedingung, die etwas öffnet | **Freigabe** | Erfüllen erlaubt etwas, das sonst nicht erlaubt wäre. |

**Entscheidung.**

- **„Trainingsvorgabe" fällt weg**, überall **„Trainingsziel"**. Ein Wort für ein Objekt.
- **„Vorgabe" allein fällt als sichtbares Wort weg.** Es sagt nichts, was nicht „Ziel",
  „Anforderung" oder „Freigabe" schärfer sagt. Jede der 29 Fundstellen wird einer der drei Spalten
  zugeordnet — nicht pauschal ersetzt.
- **„Kategorie-Ziel"** bleibt: „Ziel" mit der Angabe, worauf es sich bezieht. Dasselbe Muster wie
  „Trainingsziel".

---

## 4. Die Box redet Maschine

**Befund.** `boxStatus.sollLabel` = „Soll", `boxStatus.istLockedBolt` = „Verschlossen · Riegel zu".

Der Träger kann daran nicht ablesen, ob er etwas tun muss. „Soll"/„Ist" ist die Sprache einer
Steuerung, nicht die einer Auskunft, und „Riegel zu" beschreibt ein Bauteil.

**Entscheidung.** Die Karte sagt den Zustand und, falls nötig, die Handlung — nicht die Messgrösse.
Statt „Soll: zu / Ist: Riegel zu" heisst es „Die Box ist zu" bzw. „Die Box soll zu sein — drück den
Knopf an der Box". Die Bauteil-Wörter verschwinden aus der Träger-Sicht; in der Keyholder- und der
Diagnose-Ansicht dürfen sie bleiben, dort ist die Maschine der Gegenstand.

---

## 5. „EXIF >1h Abweichung"

**Befund.** 5 Stellen nennen EXIF. Der Träger weiss nicht, ob das eine Notiz, ein Verdacht oder
bereits ein Vergehen ist.

**Entscheidung.** Das Kürzel verschwindet aus der Träger-Sicht — es benennt ein Dateiformat, nicht
den Sachverhalt. Der Sachverhalt ist: **das Foto wurde nicht jetzt aufgenommen.** Also
„Aufnahmezeit weicht {hours} h ab" statt „EXIF >1h Abweichung", und „Foto ohne Aufnahmezeit" statt
„Foto enthält keine EXIF-Zeitangabe".

**Und die Einordnung gehört dazu**, denn genau die fehlte: der Hinweis sagt künftig, was er ist —
eine Beobachtung, die der Keyholderin angezeigt wird, kein automatisches Vergehen.

---

## Was noch offen ist

Die Entscheidungen oben sind umgesetzt, aber nicht erschöpfend. Was beim Durchgang auffiel und
bewusst liegen bleibt — damit es nicht als „erledigt" durchgeht:

**Die Folge einer Sperrzeit steht erst an einer Stelle.** Dieses Dokument verlangt sie „überall, wo
eine Sperrzeit erscheint". Umgesetzt ist die laufende Session (Träger- und Keyholder-Sicht), und
zwar korrekt an die geltende Regel gehängt (`unauthorized_opening` ist je Sub abschaltbar, eine
erlaubte Reinigungsöffnung ist ausgenommen). Ohne Folge bleiben: die **Mail, mit der die Sperrzeit
angekündigt wird** (`emails.lockPeriodSetBody` — nach der eigenen Begründung eigentlich der ERSTE
Ort) und die Keyholder-Übersicht. Die Box-Karte zählt seit dem v6-Umbau nicht mehr dazu: sie zeigt
nur noch Ereignisse der Hardware und nennt gar keine Sperrzeit mehr.

**Die eingebaute Kategorie hat im Deutschen weiter drei Namen.** „KG" (18 Werte, bleibt per
Beschluss), „Chastity Device" (der Kategoriename) und „Keuschheitsgürtel" in
`admin.kontrolleTargetKg` und `errors.TASK_REQUIREMENT_KG_CATEGORY` — genau die Bauform-Benennung,
die Kapitel 1 verwirft. Dazu im Englischen uneinheitliche Grossschreibung („Chastity device" gegen
„Chastity Device") und zwei verbliebene „belt" (`errors.WEAR_DEVICE_KG`, `devices.emptyDescription`).

**Fünftes und sechstes Wort für den Sperr-Zeitraum.** Neben „Sperrzeit" stehen „Sperrdauer" in acht
und „Sperre" in sechs Werten, alle auf der Keyholder-Seite. `admin.alreadyHasSperrzeit` heisst im
Schlüssel Sperrzeit und im Wert „Sperrdauer bereits aktiv". Das ist derselbe Defekt, den Kapitel 3
für „Vorgabe" behebt — nur eine Oberfläche weiter.

**„Riegel" / „bolt" überleben in der Träger-Sicht.** `openForm.modalBoxStaysLocked` und
`openForm.boxStaysShutBreak`. Kapitel 4 lässt die Bauteil-Wörter nur in der Keyholder- und der
Diagnose-Ansicht zu; das Öffnen-Formular ist keine von beiden.

**Die Ziel-Zeile zeigt den Vorgabe-Namen, nicht den des Nutzers.** `CategoryGoalsLive` bekommt
`KG_CATEGORY_META.name` als Prop — besser als die zwei i18n-Kopien vorher (die schon einmal
auseinandergelaufen waren: EN sagte „CB", während die DB-Zeile „KG" hiess), aber wer seine
Kategorie selbst umbenannt hat, sieht dort weiterhin nicht seinen Namen. Richtig wäre die
`DeviceCategory`-Zeile, wie sie die Schwester-Zeile `CategoryRow` schon nutzt; dafür muss der Name
durch `KgGoalRow` gereicht werden. Dasselbe gilt für `statsBlocks.tsx` und die `?? "KG"`-Rückfälle
in `mcpWrite.ts` und `taskIntervals.ts`.

**Neun Mail-Betreffe bauen dieselbe Figur von Hand.** `${APP_NAME} – …` steht in sieben Dateien,
dazu zweimal `${APP_NAME}: …` in `healthCheck.ts` — zwei Trennzeichen ohne erkennbaren Grund. Das
gehört als `appSubject()` neben `dashboardEmailHtml()` in `src/lib/mail.ts`.

---

## Was dieses Dokument nicht tut

Es benennt **keine** Bezeichner im Code um. Die Regel des Projekts steht in `CLAUDE.md`: der
deutsche Bestand (`gueltigAb`, `reinigung*`, `vorgabe*`) bleibt, neue Bezeichner sind englisch. Hier
geht es ausschliesslich um die Wörter, die ein Nutzer liest — also `messages/de.json` und
`messages/en.json` und die wenigen Stellen, die Text hart im JSX führen.
