# Geräte & Kategorien

## Zweck

Kategorien gruppieren Geräte und tragen die **Regeln**; Geräte tragen die **Eigenschaften**. Der
Keuschheitsgürtel ist die eingebaute Kategorie (`slug: "kg"`) und lässt sich nicht löschen.

## Kategorie-Regeln

Drei Schalter mit spürbarer Wirkung (siehe [stellschrauben.md](stellschrauben.md)):

- **`trackingEnabled: false`** — reine Inventar-Kategorie: keine Trage-Sessions, keine Statistik.
  **Abwesenheit in den Auswertungen ist dann keine Nichtnutzung.**
- **`requirePhoto`** — ein Trage-Beginn verlangt ein Bild.
- **`allowVorgaben: false`** — die Kategorie ist in Trainingszielen nicht wählbar.

## Geräte-Eigenschaften

`requireInspectionCode` ist der einzige mit harter Wirkung: es entscheidet, ob eine Kontrolle mit
**diesem** Gerät den handschriftlichen Code verlangt. Ist er aus, entsteht die Anforderung ohne Code
und wird über die Regel „die eine offene Anforderung" erfüllt. Nur der Keyholder darf ihn setzen — er
schwächt eine Kontrolle.

Drei weitere sind **MCP-only und rein beurteilend**, ohne Durchsetzung: `securityLevel`
(sicherndes Gerät vs. Vertrauensgerät), `pullOffRisk` (abstreifbar — `null` heisst *nie beurteilt*,
nicht *sicher*) und `lookalikeClusterId`.

## Lookalike-Cluster: die Einstellung mit Rückwirkung

Geräte gleicher Optik bekommen denselben Cluster. Zwei Folgen:

1. Ein Bild-gegen-Deklaration-Konflikt **innerhalb** eines Clusters ist nie ein echtes Vergehen — die
   Geräte sind auf dem Foto nicht zu unterscheiden.
2. Das Setzen rechnet die Geräte-Zuordnung **jeder historischen Session** mit Bild-Konflikt neu.

Das ist die einzige Geräte-Einstellung, die rückwirkt. Vorher die Vorschau prüfen.

## Es gibt keinen Gerätewechsel

Ein Wechsel läuft über eine **Reinigungsöffnung**. Folgen: er verbraucht das Tageskontingent, und
während einer Sperre ist er nur zulässig, wenn sie die Reinigung erlaubt. Freie Wechsel erlauben
heisst also: Reinigung erlauben **und** das Kontingent hoch genug halten.

## Erkennung: Bilder, Name — und drei optische Felder

Die Geräte-Erkennung bekommt die Referenzbilder, den Namen und, sofern gefüllt, **Material, Bauform
und Beschreibung**. Diese drei beschreiben, was man *sieht*, und gehen deshalb in den Prompt ein.

Bewusst **nicht** dabei: Sicherheitsstufe, Abstreif-Risiko, Verträglichkeits-Hinweise und
Sitz-Notizen. Das sind Urteile des Keyholders über Sicherheit und Tragekomfort — im Bild nicht
nachprüfbar und im Prompt nur Gewicht ohne Evidenz.

Wer die Erkennung verbessern will, hat damit vier Hebel: bessere Bilder, ein klarerer Name, und
knappe, rein optische Angaben in Material, Bauform und Beschreibung. Prosa über Tragegefühl gehört
in die Sitz-Notizen, nicht in die Beschreibung — dort verwässert sie die Erkennung.

Ihr Ergebnis ist beratend. `wrong` ist **kein** Vergehen: der Check vergleicht Bild gegen
Deklaration, nie gegen eine Anforderung. War nur „irgendetwas" zu sehen, das keiner Referenz
zuzuordnen war, ist das ein Nicht-Befund, kein Negativbefund.

## Archivieren statt löschen

`archivedAt` nimmt ein Gerät aus den Auswahllisten; die Historie bleibt vollständig.

## Wirkt auf

Kontrollen (Ziel, Code-Pflicht), Sessions/Statistik (Kategorie-Regeln), Trainingsziele,
Aufgaben (Trage-Bedingungen), Strafbuch (nur über Anforderungen).

## Code

`deviceCategoryService.ts`, `deviceAccess.ts`, `deviceCheckService.ts`, `detectDevice.ts`,
`deviceReferenceService.ts`, `deviceEmbedding.ts`, `categoryConstants.ts`.

## Tests

`deviceCheck.test.ts`, `deviceCheckService.test.ts`, `detectDevice.test.ts`,
`deviceEmbedding.test.ts`, `deviceUsage.test.ts`, `categoryConstants.test.ts`,
`inspectionCodeRule.test.ts`.
