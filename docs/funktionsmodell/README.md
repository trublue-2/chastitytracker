# Funktionsmodell

Was der Tracker kann, was sich einstellen lässt und — vor allem — **was worauf wirkt**.

Diese Sammlung beantwortet nicht „welche Features gibt es". Das liesse sich aus der Oberfläche
ablesen. Sie beantwortet die Frage, die im Betrieb tatsächlich stellt: *warum hat sich das System
gerade so verhalten, obwohl der Schalter doch anders steht.* Solche Fälle entstehen fast nie aus
einem Fehler in einer Mechanik, sondern aus dem Zusammenspiel zweier Mechaniken, die je für sich
richtig arbeiten.

Adressat sind Betreiber und Entwickler. Für die Keyholder-KI gibt es die eigene, bewusst anders
geschnittene Referenz `src/lib/mcpModelDoc.ts` (Tool `explain_model`); für den Sub die Regel-Seite
in der App. Wo sich Aussagen überschneiden, ist diese Sammlung die technische, jene die
handlungsleitende Fassung.

## Der eine Satz, der das meiste erklärt

**Der Tracker erkennt, er setzt nicht durch.**

Das Reinigungs-Kontingent verhindert keine Öffnung, es erzeugt ein Vergehen. Ein Trainingsziel misst
und fordert nichts ein. Der Geräte-Abgleich und die Schlüssel-Erkennung im Box-Foto sind beratend und
blockieren nichts. `pullOffRisk` und `securityLevel` sind Einordnungen ohne Wirkung. Und ein
erkanntes Vergehen ist eine Vorlage für ein Urteil, keine Strafe — es gibt keine automatische
Konsequenz.

Das ist keine Sammlung von Auslassungen, sondern eine Haltung: **der Server zählt, der Mensch
urteilt.** Wer sie kennt, hat die häufigste Frage im Betrieb schon beantwortet — „warum ist nichts
passiert?". Meistens lautet die Antwort: weil nichts passieren sollte.

Die beiden Ausnahmen, die tatsächlich durchsetzen, sind physisch: die Box hält den Schlüssel fest,
und die Kontroll-Eskalation bucht nach zwei Stufen selbst eine Öffnung. Beide sind ausdrücklich
einschaltbar und in ihren Steckbriefen benannt.

Wächst der Tracker um ein Gegenstück zur Strafe — eine Belohnung —, gilt derselbe Satz: auch sie
wird erkannt und vom Menschen zugesprochen, nicht ausgerechnet.

## Aufbau

| Datei | Inhalt |
|---|---|
| [01-funktionen.md](01-funktionen.md) | **Generiert.** Der Funktionskatalog: was der Tracker kann, flach aufgelistet — wer es auslöst, wo, und über welchen Endpunkt. |
| [stellschrauben.md](stellschrauben.md) | **Generiert.** Jedes Feld, das Verhalten steuert: Typ, Default, wer schreiben darf, worauf es wirkt, wo die Regel im Code steht. |
| [05-abhaengigkeiten.md](05-abhaengigkeiten.md) | **Generiert.** Je Funktion: was in sie hineinwirkt und worauf sie selbst wirkt — mit Diagramm. Die Gegenrichtung zum Register. |
| [90-kollisionen.md](90-kollisionen.md) | **Vorrang- und Kollisionsregeln.** Was gewinnt, wenn zwei Regeln gleichzeitig gelten. |
| [10-sperrzeit.md](10-sperrzeit.md) | Sperrzeit und Einschliess-Anforderung |
| [15-eintraege.md](15-eintraege.md) | Einträge & Sessions — der Rohstoff, aus dem alles abgeleitet wird |
| [20-reinigung.md](20-reinigung.md) | Reinigung (und damit der Gerätewechsel) |
| [30-kontrollen.md](30-kontrollen.md) | Kontrollen: manuell, automatisch, Eskalation |
| [35-orgasmus.md](35-orgasmus.md) | Orgasmus-Direktive |
| [40-aufgaben.md](40-aufgaben.md) | Aufgaben: Bedingungen, Nachweise, Sichtung |
| [45-trainingsziele.md](45-trainingsziele.md) | Trainingsziele |
| [50-strafbuch.md](50-strafbuch.md) | Vergehen & Strafbuch |
| [55-geraete.md](55-geraete.md) | Geräte & Kategorien |
| [60-box.md](60-box.md) | Box (Heimdall) |
| [70-nachrichten.md](70-nachrichten.md) | Nachrichten / Posteingang |
| [75-benachrichtigungen.md](75-benachrichtigungen.md) | Benachrichtigungen (Mail, Push) |
| [80-kontext.md](80-kontext.md) | Keyholder-Wissen & Kontext (die MCP-Gedächtnisschicht) |
| [85-zugang.md](85-zugang.md) | Konto, Zugang & Darstellung |

Die Steckbriefe folgen alle demselben Raster (Zweck, Stellschrauben, Auslöser, Wirkt auf,
Unterdrückt von, Sichtbarkeit, Code, Tests). Das ist Absicht: eine Frage lässt sich so in jedem
Steckbrief an derselben Stelle beantworten, und eine leere Rubrik ist ein Befund, kein Formfehler.

## Wo anfangen

- **„Was kann das Ding überhaupt?"** → [01-funktionen.md](01-funktionen.md), 87 Funktionen nach Mechanik
  gruppiert, mit einem eigenen Abschnitt für die, die niemand auslöst.
- **„Was kann ich einstellen?"** → [stellschrauben.md](stellschrauben.md), nach Domäne sortiert.
- **„Was hängt an dieser Funktion?"** → [05-abhaengigkeiten.md](05-abhaengigkeiten.md). Je Mechanik
  beide Richtungen, und getrennt danach, ob hinter einer Kante ein Schalter steht oder nicht.
- **„Warum ist das passiert?"** → [90-kollisionen.md](90-kollisionen.md). Dort stehen die Fälle, in
  denen zwei richtige Regeln ein überraschendes Ergebnis produzieren.
- **„Wie funktioniert X?"** → der Steckbrief der Mechanik.

## Systemkarte

Die Mechaniken und ihre Kanten. Eine Kante heisst „liest" oder „löst aus", nicht „ruft auf" — es ist
eine Wirkungskarte, kein Abhängigkeitsgraph des Codes.

```mermaid
flowchart TD
  subgraph Direktiven
    LOCK[Sperrzeit / Einschliess-Anforderung]
    INSP[Kontrollen]
    TASK[Aufgaben]
    ORG[Orgasmus-Direktive]
    GOAL[Trainingsziele]
  end
  subgraph Zustand
    ENTRY[Einträge]
    SESS[Sessions & Statistik]
    DEV[Geräte & Kategorien]
  end
  CLEAN[Reinigung]
  AUTO[Auto-Kontrollen]
  BOX[Box / Heimdall]
  PEN[Strafbuch]
  NOTIF[Benachrichtigungen]

  LOCK -->|erlaubt / verbietet| CLEAN
  LOCK -->|hält Schlüssel fest| BOX
  LOCK -->|Bruch = Vergehen| PEN
  CLEAN -->|Öffnung ohne Sperrbruch| ENTRY
  CLEAN -->|Wiederverschluss löst aus| AUTO
  CLEAN -->|Pause kürzt Tragezeit| SESS
  AUTO --> INSP
  INSP -->|versäumt| PEN
  INSP -->|Eskalation Stufe 2 bucht| ENTRY
  ENTRY --> SESS
  DEV -->|Code-Pflicht, Ziel| INSP
  DEV -->|Kategorie-Regeln| SESS
  TASK -->|Bedingungen lesen| ENTRY
  TASK -->|nicht erfüllt| PEN
  ORG -->|Öffnungsfenster| LOCK
  GOAL -->|misst| SESS
  LOCK --> NOTIF
  INSP --> NOTIF
  TASK --> NOTIF
```

Jede Mechanik der Karte hat einen Steckbrief. Was fehlt, ist keine Mechanik, sondern Tiefe: die
Kollisionsliste wächst mit jeder Überraschung, die im Betrieb auffällt.

## Pflege

Der generierte Teil hält sich selbst ehrlich:

```bash
npm run funktionsmodell
```

Erzeugt **alle drei** generierten Dateien aus `prisma/schema.prisma` (Form: Feld, Typ, Default) und
`src/lib/funktionsmodellRegistry.ts` (Bedeutung: wer schreibt, worauf wirkt es, wo steht die Regel).

Die Abhängigkeits-Ansicht ist dabei vollständig **abgeleitet**: sie liest dieselben `affects`-Angaben
rückwärts. Eine von Hand gepflegte Gegenrichtung wäre binnen weniger Änderungen unvollständig, und
zwar unsichtbar — eine fehlende Kante sieht aus wie keine Kante. Was sich nicht ableiten lässt, sind
die Kopplungen **ohne Schalter** (etwa: ein Wiederverschluss löst eine Kontrolle aus). Die stehen als
`FM_WIRED_EDGES` ebenfalls in der Registry, getippt und mit Code-Anker, und erscheinen in der Karte
als *feste Regel*.

`funktionsmodellDoc.test.ts` lässt `npm test` fehlschlagen, wenn

- ein Feld der geprüften Modelle keinen Registry-Eintrag hat,
- ein Registry-Eintrag auf ein Feld zeigt, das es nicht mehr gibt,
- eine API-Route oder ein MCP-Werkzeug in keiner Funktion des Katalogs vorkommt (und auch nicht
  ausdrücklich ausgenommen ist), oder umgekehrt eine Funktion auf etwas verweist, das es nicht gibt,
- oder eine der drei eingecheckten Markdown-Dateien nicht mehr zum aktuellen Stand passt.

Damit kann das Register nicht stillschweigend veralten — der übliche Tod einer
Funktionsdokumentation. Die Prosa-Steckbriefe sind von Hand gepflegt und geniessen diesen Schutz
nicht; sie sind dafür auch nicht der Ort für Zahlen, die sich ändern (die stehen im Register).

Beim Katalog greift dieselbe Idee an einer anderen Oberfläche: `funktionsmodellSurfaces.ts` liest die
tatsächlich vorhandenen Routen und Werkzeuge aus dem Quelltext, und der Test hält den Katalog dagegen.
Was er NICHT abdecken kann, sind Funktionen ohne Endpunkt — die Automatiken. Für die ist der Katalog
die einzige Liste, die es gibt, und deshalb stehen sie dort noch einmal beisammen.

**Geprüft werden alle Modelle des Schemas** — jedes Skalarfeld hat einen Eintrag, auch die
uninteressanten. Ein neues Modell trägt man in `FM_SCANNED_MODELS` ein; der Test nennt danach jedes
Feld, das noch fehlt.

Warum lückenlos statt nur die spannenden Felder: ein Register, das nur die bekannten Schalter kennt,
dokumentiert die eigene Erinnerung statt das System. Die Felder, an die niemand gedacht hat, sind
genau die, die später als unerklärliches Verhalten auffallen.
