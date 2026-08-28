import { blocksOf, type BlockIdOf, type BlockSurface, type DashboardBlockDef } from "@/lib/dashboardBlockRegistry";

/**
 * Die gespeicherte Dashboard-Konfiguration: **was ein Nutzer vom Standard ABWEICHEND will.**
 *
 * Die Speicherform ist die halbe Miete. Gespeichert wird nicht „welche Blöcke zeigen", sondern
 * „was ist anders als vorgegeben" — sonst bliebe jeder künftig hinzukommende Block bei jedem
 * Bestandsnutzer unsichtbar, weil er in seiner Liste nicht steht. Die Anforderung dazu lautet
 * wörtlich: wer nie etwas einstellt, sieht exakt das heutige Dashboard.
 *
 * Das Modul ist **rein** — kein Prisma, kein React. Die Misch-Regel ist der heikelste Teil der
 * Etappe und soll ohne Datenbank und ohne Browser prüfbar bleiben.
 */

/** Die Abweichungen EINER Oberfläche. Beide Felder optional — ein leeres Objekt heisst „Standard". */
export interface SurfaceLayout {
  /** Ids, die der Nutzer weggeschaltet hat. */
  hidden?: string[];
  /** Die Reihenfolge, wie der Nutzer sie zuletzt gesetzt hat. Darf unvollständig und veraltet sein. */
  order?: string[];
  /**
   * Ids, deren VORGABE-Zustand „zugeklappt" ist. Wie `hidden` eine Abweichungs-Liste: wer nichts
   * einstellt, bekommt alles offen.
   *
   * Die Vorgabe, nicht der Zustand: das Auf- und Zuklappen zur Laufzeit wird bewusst NICHT
   * gespeichert. Es gälte sonst für den Besuch und für die Einstellung zugleich, und die
   * Anpassen-Ansicht zeigte etwas anderes als das, was der letzte Fingertipp bewirkt hat.
   */
  collapsed?: string[];
}

/**
 * Hat diese Oberfläche überhaupt eine Abweichung? Steht HIER und nicht in der Route: die Route
 * zählte die Felder einzeln auf, mit einem Kommentar „jedes neue Feld gehört in diese Zeile" —
 * also einer Bitte statt eines Mechanismus. Vergisst sie jemand, wird die Einstellung gespeichert,
 * zu `null` gemacht und ist beim nächsten Laden weg: kein Fehler, kein Log, nur Verlust. Genau das
 * ist mit `collapsed` passiert.
 *
 * Über die WERTE statt über benannte Felder — damit jedes künftige Listenfeld von selbst zählt.
 */
export function isEmptySurface(s: SurfaceLayout | undefined): boolean {
  return Object.values(s ?? {}).every((v) => !v?.length);
}

/** Der gesamte gespeicherte Wert: je Oberfläche ein Eintrag. */
export type DashboardLayout = Partial<Record<BlockSurface, SurfaceLayout>>;

/**
 * Ein Block EINER Oberfläche. Der Typ trägt die Oberfläche und ihre Ids mit — nur deshalb kann der
 * Compiler eine Konfiguration und eine Block-Tabelle aneinanderbinden, statt dass eine Seite zur
 * Laufzeit prüfen muss, ob beide zusammengehören.
 */
export type SurfaceBlockDef<S extends BlockSurface> = DashboardBlockDef & { id: BlockIdOf<S>; surface: S };

/** Das Ergebnis der Auflösung — was die Seite tatsächlich rendert. */
export interface ResolvedLayout<S extends BlockSurface = BlockSurface> {
  /** Für welche Oberfläche das gilt. Steht im Ergebnis, damit niemand sie ein zweites Mal nennen muss. */
  surface: S;
  /** Alle Blöcke der Oberfläche in der wirksamen Reihenfolge, sichtbare wie ausgeblendete. */
  all: { block: SurfaceBlockDef<S>; hidden: boolean }[];
  /** Nur die sichtbaren, in derselben Reihenfolge. */
  visible: SurfaceBlockDef<S>[];
  hiddenCount: number;
  /**
   * Die Zuklapp-Vorgabe eines Blocks — `undefined`, wenn er gar nicht zuklappbar ist.
   *
   * Die drei Zustände sind Absicht und werden von `Section` genau so gelesen: `undefined` = kein
   * Schalter, `false` = Schalter, startet offen, `true` = Schalter, startet zu. Ein blosses
   * `boolean` hätte jeden Block zuklappbar gemacht, sobald ihn eine Oberfläche durchreicht.
   */
  collapseDefault: (id: BlockIdOf<S>) => boolean | undefined;
  /**
   * Steht dieser Block? Gebraucht, wo ein Block dem anderen ausweicht (das KG-Ziel der
   * Session-Karte). Hier statt in jedem Seiten-Kontext: die Frage ist eine Eigenschaft der
   * aufgelösten Konfiguration, keine der Seite.
   */
  shows: (id: BlockIdOf<S>) => boolean;
}

/**
 * Liest den gespeicherten JSON-Wert. Gibt bei allem Unerwarteten `{}` zurück statt zu werfen:
 * eine kaputte oder veraltete Konfiguration darf das Dashboard nicht unbenutzbar machen, sie darf
 * es höchstens auf den Standard zurückfallen lassen.
 */
export function parseDashboardLayout(raw: string | null | undefined): DashboardLayout {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as DashboardLayout;
  } catch {
    return {};
  }
}

/** Nur Zeichenketten, ohne Dubletten — die Eingabe kann aus der Datenbank oder vom Client kommen. */
function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string"))];
}

/**
 * **Die Misch-Regel.** Bringt eine gespeicherte Reihenfolge mit dem heutigen Register zusammen.
 *
 * Drei Fälle, und der dritte ist der, um den es geht:
 *
 * 1. Eine gespeicherte Id, die es nicht mehr gibt → fällt weg.
 * 2. Eine gespeicherte Id, die es noch gibt → behält ihre Position.
 * 3. **Eine Id, die der Nutzer nie gesehen hat (neuer Block) → wird an der Stelle eingefügt, an
 *    der sie im Standard steht** — also direkt hinter ihrem dortigen Vorgänger.
 *
 * Der naheliegende Weg wäre, neue Blöcke hinten anzuhängen. Das ist falsch: ein neuer Warnblock,
 * der oben stehen soll, landete unter der Historie und wäre praktisch unsichtbar. Die
 * Standard-Reihenfolge trägt eine Aussage über Dringlichkeit, und die soll ein neuer Block erben.
 */
export function mergeOrder(defaults: readonly string[], saved: readonly string[]): string[] {
  const known = new Set(defaults);
  const result = saved.filter((id) => known.has(id));
  const placed = new Set(result);

  for (const [i, id] of defaults.entries()) {
    if (placed.has(id)) continue;
    // Der nächste Vorgänger aus dem Standard, der schon einen Platz hat — dahinter gehört er.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = result.indexOf(defaults[j]);
      if (idx !== -1) { at = idx + 1; break; }
    }
    result.splice(at, 0, id);
    placed.add(id);
  }
  return result;
}

/**
 * Löst die gespeicherte Konfiguration gegen das Register auf.
 *
 * Ohne gespeicherten Wert kommt exakt die Standard-Reihenfolge heraus, nichts ausgeblendet — das
 * ist die Zusage an jeden, der nie etwas einstellt, und sie ist hier eine Eigenschaft der
 * Funktion, keine Behauptung: `saved` leer → `mergeOrder` liefert `defaults` unverändert.
 *
 * **`alwaysOn`-Blöcke lassen sich nicht ausblenden — und zwar auch dann nicht, wenn sie im
 * gespeicherten Wert als versteckt stehen.** Das ist keine Beiläufigkeit, sondern der Sinn der
 * Sache: das Flag kommt später als die gespeicherten Konfigurationen. Würde hier bloss das
 * Anbieten unterbunden und der Bestand geglaubt, wirkte es nur für neue Nutzer, während genau
 * die, denen der Block schon fehlt, ihn weiter nicht sähen. Der Bestand wird deshalb hier
 * übergangen, nicht erst beim nächsten Speichern bereinigt.
 *
 * Warum ein Block das Flag trägt, steht am Register (`DashboardBlockDef.alwaysOn`): Gerüst oder
 * Frist. Die Reihenfolge berührt das Flag nicht — verschieben bleibt erlaubt.
 */
export function resolveLayout<S extends BlockSurface>(layout: DashboardLayout, surface: S): ResolvedLayout<S> {
  const registry = blocksOf(surface) as readonly SurfaceBlockDef<S>[];
  const byId = new Map(registry.map((b) => [b.id as string, b]));
  const saved: SurfaceLayout = layout[surface] ?? {};

  const order = mergeOrder(registry.map((b) => b.id), cleanIds(saved.order));
  const hiddenIds = new Set(cleanIds(saved.hidden));

  // Dieselbe Übergehung wie bei `alwaysOn` und aus demselben Grund: das `collapsible`-Flag kommt
  // später als die gespeicherten Konfigurationen. Ein Block, der es nicht trägt, startet offen —
  // auch wenn im Bestand etwas anderes steht.
  const collapsedIds = new Set(cleanIds(saved.collapsed));

  const all = order.map((id) => {
    const block = byId.get(id)!;
    return { block, hidden: !block.alwaysOn && hiddenIds.has(id) };
  });
  const visible = all.filter((x) => !x.hidden).map((x) => x.block);
  const visibleIds = new Set<string>(visible.map((b) => b.id));

  return {
    surface,
    all,
    visible,
    hiddenCount: all.length - visible.length,
    shows: (id) => visibleIds.has(id),
    collapseDefault: (id) =>
      byId.get(id as string)?.collapsible ? collapsedIds.has(id as string) : undefined,
  };
}

/**
 * Prüft und normalisiert, was der Client schicken will — die Schreibseite.
 *
 * **Die Rollen-Grenze ist Sicherheit, nicht Anzeige:** eine Block-Id, die es nicht gibt oder die
 * einer anderen Rolle gehört, führt zu einer Ablehnung, nicht zu einem stillen Verwerfen. Ein
 * Träger, der sich per API den Notizen-Block der Keyholderin auflegen will, soll ein Nein
 * bekommen und keinen leeren Block.
 *
 * Rückgabe: der normalisierte Wert, oder ein Fehler-CODE (der Client löst ihn über i18n auf).
 */
export function checkLayoutPatch(
  value: unknown,
  role: "sub" | "keyholder",
): { layout: DashboardLayout } | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "layoutInvalid" };

  const out: DashboardLayout = {};
  for (const [surface, raw] of Object.entries(value as Record<string, unknown>)) {
    const registry = blocksOf(surface as BlockSurface);
    if (registry.length === 0) return { error: "layoutUnknownSurface" };
    // Eine Oberfläche gehört als GANZE einer Rolle. Ohne diese Prüfung liesse sich eine
    // Keyholder-Oberfläche mit leeren Listen in die eigene Zeile schreiben — folgenlos heute,
    // aber es ist genau die Art Lücke, die später jemand ausbaut.
    if (registry[0].role !== role) return { error: "layoutForeignBlock" };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "layoutInvalid" };

    const { hidden, order, collapsed } = raw as SurfaceLayout;
    // Einmal säubern, dreimal benutzt: die Listen wurden vorher je zweimal durchgerechnet, und die
    // zweite Stelle ist die, die man beim vierten Feld vergisst.
    const [sauberHidden, sauberOrder, sauberCollapsed] = [hidden, order, collapsed].map(cleanIds);
    const allowed = new Map(registry.map((b) => [b.id, b]));
    for (const id of [...sauberHidden, ...sauberOrder, ...sauberCollapsed]) {
      const block = allowed.get(id);
      if (!block) return { error: "layoutUnknownBlock" };
      if (block.role !== role) return { error: "layoutForeignBlock" };
    }
    // `alwaysOn` lässt sich nicht wegschalten — still herausfiltern statt abzulehnen: der Client
    // hat es gar nicht erst angeboten, ein Fehler wäre hier eine Falle ohne Nutzen.
    out[surface as BlockSurface] = {
      hidden: sauberHidden.filter((id) => !allowed.get(id)!.alwaysOn),
      order: sauberOrder,
      // Still herausfiltern statt abzulehnen — dieselbe Begründung wie bei `alwaysOn`: der Client
      // bietet es gar nicht erst an, ein Fehler wäre hier eine Falle ohne Nutzen.
      collapsed: sauberCollapsed.filter((id) => allowed.get(id)!.collapsible),
    };
  }
  return { layout: out };
}

/**
 * Legt die gesendeten Oberflächen über den BESTAND — je Oberfläche ersetzend, nie die ganze Spalte.
 *
 * Vier Oberflächen teilen sich eine Spalte, der Client bearbeitet immer nur eine. Wer das
 * übersieht, schreibt beim Speichern der Statistik-Reihenfolge die Dashboard-Reihenfolge weg. Genau
 * das ist passiert: „Fertig" auf einem Bildschirm setzte die drei anderen auf Standard zurück, ohne
 * Meldung. Aus Sicht des Nutzers verschob sich die Reihenfolge scheinbar von selbst.
 *
 * Ersetzend je Oberfläche und nicht tief mischend: `hidden` und `order` sind zusammen EIN Zustand.
 * Eine halb übernommene Reihenfolge wäre schlimmer als eine ganz verworfene.
 *
 * `bestand` kommt als roher Spaltenwert (JSON-Text oder `null`) — unlesbarer Text zählt wie kein
 * Bestand: lieber die drei anderen Oberflächen verlieren, als die eine nicht speichern zu können.
 */
export function mergeLayout(bestand: unknown, patch: DashboardLayout): DashboardLayout {
  let vorher: DashboardLayout = {};
  if (typeof bestand === "string" && bestand.trim() !== "") {
    try {
      const roh = JSON.parse(bestand);
      if (roh && typeof roh === "object" && !Array.isArray(roh)) vorher = roh as DashboardLayout;
    } catch { /* unlesbar — wie kein Bestand behandeln */ }
  }
  return { ...vorher, ...patch };
}

