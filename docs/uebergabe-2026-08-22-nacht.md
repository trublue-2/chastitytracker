# Übergabe — Stand 22.08.2026, Nacht

Dritte Sitzung dieses Tages. Die vorige hat `docs/uebergabe-2026-08-22-abend.md` hinterlassen; was
dort unter „Entscheidungen, die schon gefallen sind" steht, gilt weiter und wird hier nicht
wiederholt. Diese Datei ist der Einstieg für die nächste.

**Kurz:** **Etappe B ist fertig** (v5.3.1) — alle vier Block-Stapel holen ihre Daten je Block, ein
ausgeblendeter Block kostet nirgends mehr eine Abfrage. Dazu zwei Bestandsfehler, die dabei
auffielen und auf Ansage behoben wurden (v5.3.2). Alles auf `main` und gepusht; gebaut ist
**nur `:feature`**, die Flotte steht weiter auf v5.2.9. Damit sind A, B und C durch; als Nächstes
steht D0 an (die hellen Fassungen der neuen Palette).

## Was auf dem Branch liegt

```
<fix>   fix(keyholder): die unbefristete Sperre und eine Zählweise (v5.3.2)
e6e0197 refactor(keyholder): die Sub-Detailseite holt ihre Daten je Block (v5.3.1)
1e2e2cf refactor(statistik): die Statistik-Blöcke holen ihre Daten selbst
992a813 refactor(dashboard): jeder Block des Träger-Dashboards holt seine Daten selbst
```

Ringe: `main` v5.3.2, `:feature` v5.3.2 (trublue **und die fremden Mittester**), `:portal` v5.2.9
(23 Instanzen), `:latest` v5.2.5. **Der Nachzug der Flotte und der `:latest`-Promote warten weiter
auf eine ausdrückliche Ansage.**

## Was Etappe B gebaut hat

Vorher lud jede der vier Seiten alles in einem `Promise.all`, bevor der erste Block entstand.
Jetzt deklariert jeder Block seine Daten, und geladen wird nur, was sichtbar ist.

| Datei | Was |
|---|---|
| `lib/blockStack.ts` | `block({load, render})` + `renderStack`. Die Zusage „ein ausgeblendeter Block kostet keine Abfrage" steht hier an EINER Stelle (Test dazu) |
| `lib/dashboardData.ts` | die geteilten Quellen, je `cache()`-memoisiert |
| `app/dashboard/dashboardBlocks.tsx` | 15 Blöcke |
| `app/components/statsBlocks.tsx` | 12 Blöcke, ZWEI Oberflächen |
| `app/admin/users/[id]/keyholderSubBlocks.tsx` | 14 Blöcke |
| `app/components/BlockStack.tsx` | der Stapel-Rahmen, den vorher alle drei Seiten wortgleich hatten |

Die Seiten selbst sind zusammengeschrumpft: `dashboard/page.tsx` 470 → 55 Zeilen, `StatsMain.tsx`
555 → 77, `admin/users/[id]/page.tsx` 412 → 60.

**Drei Dinge, die man wissen muss, bevor man daran weiterbaut:**

1. **`cache()` schlägt über die tatsächlich ÜBERGEBENEN Argumente nach, nicht über die
   aufgefüllten.** Ein Vorgabewert für einen Parameter ist deshalb eine Falle: ein Aufruf mit drei
   und einer mit vier Argumenten landen auf verschiedenen Einträgen, auch wenn der vierte genau der
   Vorgabewert ist. Genau so lief die Aufgaben-Auswertung eine Zeit lang zweimal je Seitenaufbau.
   Argumente bleiben primitiv UND vollzählig.
2. **Nicht nur Abfragen gehören in die Quellen-Schicht, auch Ableitungen.** Die teure Hälfte dieser
   Seiten sind Paarungen und Summen über die ganze Historie, keine Datenbank-Runden. Was zwei
   Blöcke brauchen, gehört nach `dashboardData.ts` — sonst rechnet es je Block einmal, und der
   Gewinn ist wieder weg.
3. **`audience` statt zweier ausgeschriebener Fassungen.** Wo Träger- und Keyholder-Sicht dieselbe
   Frage verschieden beantworten, steht EINE Umsetzung mit einem `audience`-Argument und darüber
   zwei benannte Hüllen. Zwei Kopien derselben Herleitung laufen früher oder später auseinander.

Dazu: `ResolvedLayout` trägt seine Oberfläche jetzt im Typ (`ResolvedLayout<"subDashboard">`).
Damit bindet der Compiler Konfiguration und Block-Tabelle aneinander; die Laufzeit-Prüfung auf ein
fremdes Layout und die `as BlockIdOf<S>`-Casts sind entfallen. `layout.shows(id)` beantwortet die
Sichtbarkeit eines einzelnen Blocks — gebraucht an genau einer Stelle (siehe unten).

## Die eine bewusste Verhaltensänderung

Das KG-Ziel weicht der grünen Session-Karte aus. Bisher entschieden das die **Daten** (läuft eine
Session?), jetzt zusätzlich die **Sichtbarkeit** des Blocks: wer die Session-Karte ausblendet,
verlor sonst sein KG-Ziel mit ihr. Auf ausdrückliche Ansage so gebaut.

Damit die beiden Blöcke gar nicht verschieden antworten können, liest die Frage EINE Quelle
(`sessionCardOnScreen` in `dashboardBlocks.tsx`), und die Karte hat keine eigene, dort unsichtbare
Abbruchbedingung im `render` — `load` gibt `null`, sonst nichts.

## Wie geprüft wurde

**Struktur-Abzug vorher/nachher**, je Etappe frisch genommen: der Vorher-Stand entsteht durch
`git stash` unmittelbar vor dem Nachher-Lauf, damit keine Zeit dazwischen vergeht. Alle vier Seiten
sind byte-identisch. Ohne dieses Vorgehen meldet der Vergleich Abweichungen, die reiner Zeitablauf
sind — eine laufende Trage-Session tickt, und `2T 18h 0min` schreibt sich anders als `2T 18h`.

**Der Abzug hat einen echten Fehler gefunden**, den weder Compiler noch Tests sahen: die
Kontroll-Liste der Keyholderin beschriftete ihren „Alle"-Link aus dem falschen Namensraum und zeigte
den rohen Schlüssel `admin.all`. Das ist die dritte Sitzung in Folge, in der eine Prüfung am
gerenderten Ergebnis etwas findet, das der Typ nicht sieht.

Die Testumgebung dafür steht (Rezept in der Abend-Übergabe). Konten `testsub` / `testkh`,
DB `/tmp/kg-block-loaders/db.db`, Dev-Server als `block-loaders` auf Port 3300 in der
Workspace-`launch.json`.

## Zwei Befunde, inzwischen behoben (v5.3.2)

Beide fielen im Review von Etappe B auf, gehörten aber nicht dazu — es waren Bestandsfehler, und
beide ändern Verhalten. Deshalb erst gefragt, dann gebaut:

- **Die Keyholderin sah eine laufende UNBEFRISTETE Sperre nicht, wenn sie sie selbst terminiert
  hatte.** `sperrzeitUnbefristet` verlangte zusätzlich `!wirksamAb`; war die Sperre unbefristet UND
  geplant gewesen, blieben alle drei Sperr-Angaben leer und die ganze Zeile verschwand aus ihrer
  Karte — der Träger sah sie. Jetzt: „Unbefristet verschlossen · läuft seit …". Der Zusatz steht
  NUR dort, wo sonst gar kein Zeitpunkt stünde; eine befristete Sperre trägt ihre Frist ohnehin.
- **Übersicht und Statistik zählten dieselbe Grösse verschieden.** Die Zählweise der Übersicht
  gilt: `wearCountsCached` ist die eine Stelle, aus der beide Karten lesen. Anzahl = alle Paare
  (die laufende mit), Summe = nur Abgeschlossenes, ohne die Positiv-Schranke aus
  `completedPairsFrom`. Die REKORDE bleiben auf der Positiv-Menge — eine Session ohne Dauer wäre
  als „kürzeste" ein Messfehler, keine Auskunft (Test: `utils.test.ts`, `pairDurationMs`).

Daraus folgte eine dritte Entscheidung: die Übersichts-Karte zeigt Anzahl, Summe und Mittelwert
nebeneinander, und seit die Anzahl die laufende Session mitzählt, geht die Rechnung nicht mehr auf.
Der Mittelwert heisst deshalb jetzt **„Ø Dauer (abgeschlossene)"**. Die Monatsübersicht zählt
weiterhin nur Abgeschlossenes und summiert sich absichtlich NICHT auf die Anzahl darüber: eine
laufende Session gehört in keinen Monat, solange sie läuft, sonst änderte ein abgeschlossener Monat
nachträglich seine Zahl.

## Gefunden, nicht behoben

- **`lib/categoryRows.ts`** baut sich seine eigene Trage-Paarung, obwohl es dieselbe Ableitung ist,
  die jetzt als Quelle bereitsteht. Andere Seite, ausserhalb dieser Etappe.
- **Die Keyholder-Detailseite paart die Historie zweimal je Aufruf**, seit die Zählweise über
  `kgPairsCached` (ohne Kontroll-Punkte) läuft, während die Seite ihre Paarung MIT Punkten ohnehin
  baut. Reine Rechenzeit, keine zweite Abfrage — aber es nimmt ein Stück von dem zurück, was
  Etappe B gebracht hat.
- **Für den `admin`-Namensraum erzwingt kein Test, dass ein Schlüssel in beiden Sprachdateien
  steht.** Die vorhandenen Paritäts-Tests decken `dashboard`-Blocklabels, `messages`, `emails` und
  die Vergehens-Labels ab — sonst ist es Disziplin.

## Bewusst nicht gemacht

- **Blockweises Streaming.** `renderStack` lädt alle sichtbaren Blöcke in einem `Promise.all` — die
  Seite wartet also weiter auf den langsamsten. Jeden Block einzeln in `Suspense` zu wickeln, wäre
  technisch klein und brächte Streaming und Fehler-Isolierung geschenkt. Es ändert aber, wie die
  Seite sich AUFBAUT (Blöcke poppen nacheinander herein), und das ist eine Gestaltungsfrage, keine
  Aufräum-Frage. Ausserdem war es vorher auch nicht anders, es ist also nichts verloren.
- **Geteilte Prop-Bauer für die Karten, die auf beiden Oberflächen stehen.** `LaufendeSessionCard`
  bekommt 15 Props, 12 davon mechanisch — aber die drei, die sich unterscheiden, sind verschiedene
  BEGRIFFE, nicht Varianten (die Reinigungs-Zeile liest beim Träger seine Einstellung, bei ihr die
  Eigenschaft der Sperre). Ein gemeinsamer Bauer mit drei Überschreibungen wäre ein schlechtes
  Geschäft; er hätte ausserdem den Befund oben verdeckt. Die LADE-Hälften teilen sich dagegen
  längst eine Quelle.

## Offene Fäden

Unverändert aus der Abend-Übergabe, plus das Obige:

- **Flotte auf v5.3.x nachziehen** (`:portal`) und danach **`:latest` promoten** — die Self-Hoster
  stehen sieben Versionen zurück. Braucht ausdrückliches OK; die Migration `dashboard_layout` liefe
  dabei auf allen 23 Instanzen (additiv, nullable, Rückroll gefahrlos). **Achtung:** ein
  `main`-Build zieht die Flotte IMMER mit — „nur `:feature`" geht ausschliesslich über einen Build
  vom Branch-Ref.
- **Box Soll/Ist** — entschieden, nicht gebaut.
- **`design/entwurf`** liegt auf dem Remote, nicht gemergt. Grundlage für D.
- **Etappe D0** — die hellen Fassungen der neuen Palette entwerfen.
- **Etappe E** — 118 Komponenten, `Card` in 34 Dateien, 825 hartkodierte Schriftgrössen.
- **Etappe F** — Issue #37, Notizen in der Oberfläche.
- **Die zwei fremden Worktrees** (`kg-gewicht`, `kg-weight`) liegen weiter unangetastet daneben.
