# Übergabe — Stand 22.08.2026, Nacht

Dritte Sitzung dieses Tages. Die vorige hat `docs/uebergabe-2026-08-22-abend.md` hinterlassen; was
dort unter „Entscheidungen, die schon gefallen sind" steht, gilt weiter und wird hier nicht
wiederholt. Diese Datei ist der Einstieg für die nächste.

**Kurz:** **Etappe B ist fertig** — alle vier Block-Stapel holen ihre Daten je Block, ein
ausgeblendeter Block kostet nirgends mehr eine Abfrage. Drei Commits auf `feat/block-loaders`,
v5.3.1, **nicht gepusht, nicht ausgerollt.** Damit sind A, B und C durch; als Nächstes steht D0 an
(die hellen Fassungen der neuen Palette).

## Was auf dem Branch liegt

```
e6e0197  refactor(keyholder): die Sub-Detailseite holt ihre Daten je Block (v5.3.1)
1e2e2cf  refactor(statistik): die Statistik-Blöcke holen ihre Daten selbst
992a813  refactor(dashboard): jeder Block des Träger-Dashboards holt seine Daten selbst
```

Die Ringe stehen unverändert: `main` v5.3.0, `:feature` v5.3.0, `:portal` v5.2.9 (23 Instanzen),
`:latest` v5.2.5. **Beide Nachzüge warten weiter auf eine ausdrückliche Ansage.**

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

## Gefunden, nicht behoben

- **Die Keyholderin sieht eine laufende UNBEFRISTETE Sperre nicht, wenn sie sie selbst terminiert
  hatte.** `keyholderSubBlocks.tsx`, Block `sessionOrStatus`: `sperrzeitUnbefristet` verlangt
  zusätzlich `!wirksamAb`. Ist die Sperre unbefristet UND war sie geplant (`wirksamAb` gesetzt,
  inzwischen vergangen), sind alle drei Sperr-Angaben leer und die ganze Sperr-Zeile verschwindet
  aus ihrer Karte — der Träger sieht sie. Bestand, unverändert übernommen; ein Fix wäre eine
  Verhaltensänderung und gehört entschieden, nicht nebenbei gemacht.
- **Die Keyholder-Übersicht und die Statistik zählen verschieden.** „Tragezeiten" in der
  Kompakt-Karte zählt ALLE Paare (die laufende mit), die Statistik nur die abgeschlossenen, und
  deren Gesamtdauer lässt zusätzlich Paare ohne positive Dauer weg. Steht jetzt als Kommentar an
  der Karte. Bestand — aber zwei Zahlen für dieselbe Frage sind eine Frage der Zeit.
- **`lib/categoryRows.ts`** baut sich seine eigene Trage-Paarung, obwohl es dieselbe Ableitung ist,
  die jetzt als Quelle bereitsteht. Andere Seite, ausserhalb dieser Etappe.

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
  stehen sechs Versionen zurück. Braucht ausdrückliches OK; die Migration `dashboard_layout` liefe
  dabei auf allen 23 Instanzen (additiv, nullable, Rückroll gefahrlos).
- **`feat/block-loaders` ist nicht gepusht** und nicht nach `main` gemergt.
- **Box Soll/Ist** — entschieden, nicht gebaut.
- **`design/entwurf`** liegt auf dem Remote, nicht gemergt. Grundlage für D.
- **Etappe D0** — die hellen Fassungen der neuen Palette entwerfen.
- **Etappe E** — 118 Komponenten, `Card` in 34 Dateien, 825 hartkodierte Schriftgrössen.
- **Etappe F** — Issue #37, Notizen in der Oberfläche.
- **Die zwei fremden Worktrees** (`kg-gewicht`, `kg-weight`) liegen weiter unangetastet daneben.
