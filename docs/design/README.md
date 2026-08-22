# Gestaltungs-Entwurf

Ein Vorschlag für das Aussehen der App — **kein umgesetzter Stand**. Nichts hiervon ist im Code;
die Dateien hier sind Entwürfe zum Anschauen und Weiterentwickeln.

Öffne irgendeine Datei in [`vorschau/`](vorschau/) im Browser. Die Quellen in [`quelle/`](quelle/)
sind dieselben Bildschirme im Artboard-Format des Design-Werkzeugs.

## Der Kern in drei Sätzen

**Drei Farben mit je einer Bedeutung. Die Rolle sitzt im Raum, nicht im Akzent. Zahlen sind das
Produkt.**

Alles Weitere unten folgt daraus.

## Farbe

| | | |
|---|---|---|
| **Rosa** | `#ff3d68` | Der Zustand: verschlossen, laufend, aktiv. Die Identität des Produkts. Je Bildschirm genau einmal gross. |
| **Gold** | `#e8b44a` | Die Auszeichnung: Ziel erreicht, Rekord, orgasmusfreie Zeit. Selten, deshalb wirksam. |
| **Koralle** | `#ff8a5c` | Die Aufmerksamkeit: zu spät, Vergehen, Frist läuft ab. Nie dekorativ, immer eine Aufforderung. |

Mehr Bedeutungsfarben gibt es nicht. Alles andere ist neutral.

**Intensität läuft über Helligkeit, nicht über den Farbton** — eine einzige Rampe von fast schwarz
bis zum vollen Rosa, gültig für Kalender, Balken und Ringe:

`#1a1013` → `#4a1226` → `#7a1836` → `#a11f45` → `#ff3d68`

### Die Rolle sitzt im Grund

Die App unterscheidet heute schon vier Themes (`user`, `user-dark`, `admin`, `admin-light` in
`src/lib/theme.ts`) — Träger grün, Keyholder indigo. Diese Trennung bleibt, aber sie wandert vom
Akzent auf den **Grund**:

| | Grund | Schein |
|---|---|---|
| Träger | `#0b0609` warm | Weinrot |
| Keyholder | `#070810` kühl | Indigo |

Warum nicht über den Akzent: dann hiesse „verschlossen“ beim Träger rosa und beim Keyholder indigo
— dieselbe Tatsache in zwei Farben, obwohl beide auf dasselbe schauen. **Man erkennt die Rolle an
der Temperatur des Raums, den Sachverhalt an der Farbe des Signals.**

In `vorschau/` liegen beide Fassungen nebeneinander (`keyholder-uebersicht.html` kühl,
`keyholder-uebersicht-warm.html` zum Vergleich).

### Textstufen

`#f4f5fb` hoch · `#bcbed3` mitte · `#8c8ea6` leise — alle drei über 4,5:1 auf dem Grund.
Eine frühere Fassung lag bei „leise“ auf etwa 3:1 und wirkte deshalb flau.

## Schrift

- **Archivo** für alles Laufende, **Instrument Serif** für Überschriften und die Wortmarke.
- Zahlen immer **tabellarisch** — sonst springt die laufende Uhr bei jeder Sekunde.
- Stufen: Zahl gross 60 / Titel 32 (Serif) / Zeile 16 / Fliesstext 14 / Nebeninfo 12 / Rubrik 11.

## Regeln, die das Ganze zusammenhalten

- **Keine Karten.** Abschnitte trennen sich durch Haarlinien und Raum, nicht durch Rahmen.
- **Genau ein gefüllter Knopf je Bildschirm.**
- **Leuchten gibt es nur an der runden Taste.** Sobald mehr als eine Stelle strahlt, ist die
  Hierarchie weg.
- **Drei Lautstärken je Bildschirm**, klar getrennt: eine grosse Sache, ein mittlerer Block,
  leise Listen.
- **Ziffern statt ausgeschriebener Zahlen.** „54 Tage“, nicht „Vierundfünfzig Tage“.

## Die Bildschirme

| Datei | Was sie zeigt |
|---|---|
| `bauteile.html` | Farben, Textstufen, Marken, Knöpfe, Felder, Zeilen, Leer-/Warte-/Störzustand, Navigation |
| `dashboard-verschlossen.html` | Der vollständige Träger-Bildschirm — alle Blöcke, Zahlen, Listen, Blätterung |
| `dashboard-offen.html` | Derselbe Bildschirm geöffnet: die Farbe verschwindet, der Inhalt dreht auf „was fehlt“ |
| `dashboard-offen-mit-frist.html` | Geöffnet mit laufender Einschliess-Frist — Koralle führt |
| `statistik.html` | Kennzahlen, Kalender in der Helligkeits-Rampe, orgasmusfreie Zeit |
| `keyholder-uebersicht.html` | Alle Subs auf einen Blick, nach dem sortiert, was eine Entscheidung braucht |
| `keyholder-sub.html` | Ein Sub im Detail: Zustand, „Wartet auf dich“, die zwölf Hebel, private Notizen |

### Die Umkehrung beim Keyholder

Der Träger-Bildschirm ist ein **Zeuge**: eine riesige Zahl, die wächst. Der Keyholder-Bildschirm ist
eine **Konsole**: mehrere Zustände kompakt plus Hebel. Deshalb führt dort **Koralle statt Rosa** —
die grosse Zahl oben ist keine Dauer, sondern die Anzahl offener Entscheidungen.

## Inhalte

Die Bildschirme sind an einer echten Instanz überprüft worden; die **Struktur und die Dichte
stimmen** mit dem heutigen Stand überein. Namen, Gerätebezeichnungen, Aufgabentitel und Daten sind
für dieses Repo **ersetzt** — das Repo ist öffentlich, persönliche Inhalte gehören nicht hinein.
Die Zahlen und Prozente sind unverändert, damit die Dichte beurteilbar bleibt.

## Befunde aus dem Abgleich mit der echten App

Beim Nachbauen mit echten Inhalten fielen Dinge auf, die keine Gestaltungsfragen sind:

1. **Dieselbe Dauer trägt zwei Prozentwerte.** Die Trainingsvorgabe rechnet `17:26 / 20:00 = 87 %`,
   der Statistik-Auszug zwei Blöcke tiefer `17:27 = 81 %` — auf einem Bildschirm.
2. **Vier Dauer-Formate nebeneinander:** `5h 40min 16s`, `17:26 / 20:00h`, `1T 5h 52min`, `14h 12m`.
3. **Der Kontroll-Code ist das Grösste in jeder Zeile**, obwohl er nach der Erfüllung wertlos ist.
   Dass eine Kontrolle 19 Minuten zu spät kam, muss man aus zwei grauen Zeitstempeln selbst
   ausrechnen.
4. **Farbe sagt zweimal das Gegenteil:** der Tragekalender kodiert Intensität in Blau, obwohl Blau
   im Farbsystem `unlock` bedeutet; die Balken im Trainingsziel stehen in Indigo, also `request`.
5. **„KG-Tracker“ bricht in der Kopfzeile auf zwei Zeilen.**
6. **„TRAININGSVORGABEN“ steht zweimal auf demselben Bildschirm** und meint zweierlei.

Punkt 1 und 2 würde ich unabhängig vom Design angehen.

## Wie es dazu kam

Der Weg gehört zur Begründung — ohne ihn sieht die Farbwahl wieder beliebig aus. Drei Anläufe
wurden verworfen, und jeder Einwand hat etwas Bestimmtes verbessert:

1. **Typo-Skala auf dem bestehenden System** — zu zaghaft. Handwerk statt Haltung.
2. **Vier Richtungen als Skizzen** — zu dünn. „Zu wenig Liebe, zu wenig Details“: vier magere
   Entwürfe statt eines fertigen.
3. **Ein Bildschirm in Tiefe, warme Palette** — willkürliche Farben ohne System.
4. **Dunkel, drei Farben, ein dominantes Element** — trägt. Danach nachgeschärft: Kontrast angehoben,
   ausgeschriebene Zahlen durch Ziffern ersetzt, sämtliche Inhalte wieder vollständig aufgenommen,
   die Rollentrennung wiederhergestellt.

Die verworfenen Stände liegen als Artifacts:
[Typo-Skala](https://claude.ai/code/artifact/64b5a70d-d0b6-4493-90f8-41dd7fa10e29) ·
[Vier Richtungen](https://claude.ai/code/artifact/7286bfbf-4358-4adc-88d7-0f7260ddbabb) ·
[Erster Tiefenversuch](https://claude.ai/code/artifact/49c3104e-cd68-40d2-b8ba-a065249ba5c9) ·
[Helle Fassung mit echten Inhalten](https://claude.ai/code/artifact/c8ad17a6-066b-4592-ab9b-663658048afd)

## Was noch fehlt

- Erfassen-Formulare samt Fotoaufnahme
- Nachrichten und Posteingang
- Der Kalender-Kategorie-Umschalter und die Wochenprozente in der Statistik
- Helle Fassung des neuen Systems — heute existiert nur die dunkle
- Bewegung: was passiert beim Verschliessen, beim Ablauf einer Frist
