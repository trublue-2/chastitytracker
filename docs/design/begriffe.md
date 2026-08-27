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

## 1. Das Gerät — „KG" verschwindet aus der Oberfläche

**Befund.** 28 sichtbare Stellen sagen „KG", ohne es je aufzulösen. Die englische Seite ist
schlimmer: `KG` 7×, `CB` 8×, `chastity` 7×, `device` 64× — **vier** Namen für eine Sache, und `CB`
ist eine Abkürzung, die im Deutschen nie erklärt wird und im Englischen auch nicht.

**Entscheidung.** Die Abkürzung fällt weg, ersatzlos. Sie wird nicht durch ein langes Wort ersetzt,
sondern meist durch gar nichts:

| Alt | Neu | Warum |
|---|---|---|
| „KG-Ziele" | „Ziele" | Auf dem Träger-Dashboard ist der Zusammenhang der Gürtel. Das Präfix trägt keine Information. |
| „KG-Tragezeiten" | „Tragezeiten" | dito |
| „Aktuelle KG-Tragezeit" | „Aktuelle Tragezeit" | dito |
| „Welchen KG trägst du?" | „Welches Gerät trägst du?" | Hier muss die Sache benannt werden — und die Auswahl zeigt ohnehin Kategorie und Gerätenamen. |
| „KG ist verschlossen" | „Du bist verschlossen" | Der Zustand gehört dem Träger, nicht dem Ding. |
| „Tracke mehr als nur KG" | „Tracke mehr als den Gürtel" | Werbezeile — hier ist das Wort der Punkt. |
| EN `CB` / `KG` | `belt` bzw. weglassen | Eine Abkürzung weniger, nicht eine andere. |

**Das generische Wort ist „Gerät" (EN `device`).** Es steht ohnehin schon 64× im englischen Blatt,
die Datenmodelle heissen so (`Device`, `DeviceCategory`), und es deckt ab, was die App seit den
Kategorien wirklich verwaltet: Gürtel, Käfige, Plugs, Ringe, Knebel. „Keuschheitsgürtel"
ausgeschrieben wäre für die Mehrzahl der Geräte schlicht falsch.

**Was NICHT angefasst wird:** der Slug `kg` (`KG_BUILTIN_SLUG`) und der `name`-Wert `"KG"` der
eingebauten Kategorie in der Datenbank. Der steht in den Datensätzen jeder Instanz, ist von den
Nutzern umbenennbar, und ein Rename wäre eine Migration über fremde Bestände — für null sichtbaren
Gewinn, weil die Kategorienliste den Namen zeigt, den der Nutzer gesetzt hat.

---

## 2. Zeiträume — vier Sachen, vier Wörter

**Befund.** Sichtbar sind: `Tragezeit` 35×, `Verschluss` 36×, `Sperrzeit` 36×, `Frist` 42×.

Das sind **keine** Synonyme:

| Sache | Wort | Was es ist |
|---|---|---|
| Der gemessene Zeitraum vom Anlegen bis zum Ablegen | **Tragezeit** | Beobachtung. Wird gezählt, nicht angeordnet. |
| Der Zustand jetzt | **verschlossen / offen** | Kein Zeitraum. Seit v6 sagt ihn zusätzlich die Farbe. |
| Ein angeordneter Zeitraum mit Ende | **Sperrzeit** | Anordnung der Keyholderin. Hat ein Ende, das der Träger kennt. |
| Der Zeitpunkt, bis zu dem etwas zu tun ist | **Frist** | Gehört einer Forderung, nicht einem Zustand. |

**Entscheidung.** Alle vier bleiben — sie benennen vier verschiedene Dinge. Was geht, ist das
fünfte Wort:

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

## Was dieses Dokument nicht tut

Es benennt **keine** Bezeichner im Code um. Die Regel des Projekts steht in `CLAUDE.md`: der
deutsche Bestand (`gueltigAb`, `reinigung*`, `vorgabe*`) bleibt, neue Bezeichner sind englisch. Hier
geht es ausschliesslich um die Wörter, die ein Nutzer liest — also `messages/de.json` und
`messages/en.json` und die wenigen Stellen, die Text hart im JSX führen.
