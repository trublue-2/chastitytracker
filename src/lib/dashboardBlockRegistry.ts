/**
 * Das Register der Dashboard-Blöcke: **welche Blöcke es gibt, auf welcher Oberfläche sie stehen,
 * wem sie gehören und in welcher Reihenfolge sie erscheinen.**
 *
 * Wozu: bis hierher war die Reihenfolge in `dashboard/page.tsx` fest verdrahtet — vierzehn Blöcke
 * hintereinander im JSX, ohne Namen und ohne Handhabe. Ein Block liess sich weder benennen noch
 * ausblenden noch verschieben, weil es ihn als *Ding* gar nicht gab, nur als Stelle im Baum.
 *
 * **Die Vollständigkeit erzwingt der Compiler, nicht ein Test.** Die Seite baut ihre Blöcke als
 * `Record<SubDashboardBlockId, ReactNode>` — ein vergessener Block ist ein Typfehler, ein
 * erfundener ebenso. Deshalb steht hier keine Komponente: das Register nennt und ordnet, die Seite
 * rendert. Wer beides mischt, holt sich die halbe Seite in eine Datei, die nur eine Liste sein will.
 *
 * NICHT hier: die Datenbeschaffung. Die Seite lädt weiterhin alles in einem `Promise.all`, ein
 * ausgeblendeter Block spart also noch keine Abfrage. Das ist bewusst aufgeschoben (Etappe B des
 * Redesign-Plans) und ändert an diesem Register nichts — es bekommt später ein `load` je Eintrag.
 */

/** Die Oberflächen mit Block-Stapel. */
export const BLOCK_SURFACES = ["subDashboard", "subStats", "keyholderSub", "keyholderStats"] as const;
export type BlockSurface = (typeof BLOCK_SURFACES)[number];

export interface DashboardBlockDef {
  /** Stabil — dieser Wert landet in der gespeicherten Konfiguration und darf sich nie ändern. */
  readonly id: string;
  readonly surface: BlockSurface;
  /**
   * Wem der Block gehört. **Sicherheit, nicht Anzeige:** der Server prüft beim Speichern jede
   * Block-Id gegen diese Rolle, damit ein Träger sich nicht per API einen Keyholder-Block auflegt.
   */
  readonly role: "sub" | "keyholder";
  /** Beschriftung im Bearbeiten-Modus. Schlüssel im `dashboard`-Namespace. */
  readonly labelKey: string;
  /**
   * Gesetzt, wenn der Block sich nicht abschalten lässt — nicht aus Bevormundung, sondern weil er
   * kein Inhalt ist: die Begrüssungszeile trägt den Bearbeiten-Knopf selbst.
   */
  readonly alwaysOn?: true;
}

/**
 * Das Träger-Dashboard, in der Reihenfolge, in der es heute rendert.
 *
 * Die Reihenfolge IST die bisherige — das ist die Vorgabe für jeden, der nichts einstellt, und
 * zugleich das Prüfkriterium dieser Etappe: der Bildschirm sieht danach exakt gleich aus.
 */
export const SUB_DASHBOARD_BLOCKS = [
  { id: "greeting", surface: "subDashboard", role: "sub", labelKey: "blockGreeting", alwaysOn: true },
  { id: "alerts", surface: "subDashboard", role: "sub", labelKey: "blockAlerts" },
  { id: "boxStatus", surface: "subDashboard", role: "sub", labelKey: "blockBoxStatus" },
  { id: "openTasks", surface: "subDashboard", role: "sub", labelKey: "blockOpenTasks" },
  { id: "openPenalties", surface: "subDashboard", role: "sub", labelKey: "blockOpenPenalties" },
  { id: "runningSession", surface: "subDashboard", role: "sub", labelKey: "blockRunningSession" },
  { id: "activeWearSessions", surface: "subDashboard", role: "sub", labelKey: "blockActiveWear" },
  { id: "categoriesPromo", surface: "subDashboard", role: "sub", labelKey: "blockCategoriesPromo" },
  { id: "incompleteCategories", surface: "subDashboard", role: "sub", labelKey: "blockIncompleteCategories" },
  { id: "categoryGoals", surface: "subDashboard", role: "sub", labelKey: "blockCategoryGoals" },
  { id: "inactiveCategories", surface: "subDashboard", role: "sub", labelKey: "blockInactiveCategories" },
  { id: "statusAndStats", surface: "subDashboard", role: "sub", labelKey: "blockStatusAndStats" },
  { id: "sessionList", surface: "subDashboard", role: "sub", labelKey: "blockSessionList" },
  { id: "wearSessionList", surface: "subDashboard", role: "sub", labelKey: "blockWearSessionList" },
  { id: "taskList", surface: "subDashboard", role: "sub", labelKey: "blockTaskList" },
] as const satisfies readonly DashboardBlockDef[];

export type SubDashboardBlockId = (typeof SUB_DASHBOARD_BLOCKS)[number]["id"];

/** Alle Blöcke aller Oberflächen. Wächst mit jeder Oberfläche, die dazukommt. */
export const DASHBOARD_BLOCKS: readonly DashboardBlockDef[] = [...SUB_DASHBOARD_BLOCKS];

/**
 * Die Blöcke einer Oberfläche in ihrer Standard-Reihenfolge.
 *
 * Die Reihenfolge ist die Reihenfolge im Array — kein `defaultOrder`-Zahlenfeld. Zahlen müssten
 * bei jedem Einschub umnummeriert werden, und eine doppelt vergebene Zahl fiele niemandem auf.
 */
export function blocksOf(surface: BlockSurface): readonly DashboardBlockDef[] {
  return DASHBOARD_BLOCKS.filter((b) => b.surface === surface);
}

/**
 * Die Ids EINER Oberfläche als Typ. Bindet Oberfläche und Record aneinander — ohne diese
 * Zuordnung liesse sich der Record des Dashboards an eine andere Oberfläche reichen, und heraus
 * käme eine Liste aus `undefined`: eine leere Seite, kein Fehler.
 */
export type BlockIdOf<S extends BlockSurface> = S extends "subDashboard" ? SubDashboardBlockId : never;

/**
 * Bringt die gerenderten Blöcke einer Oberfläche in Reihenfolge.
 *
 * `nodes` ist ein VOLLSTÄNDIGER Record über die Ids GENAU DIESER Oberfläche — daran hängt die
 * Compiler-Garantie: die Seite kann keinen Block vergessen, keinen erfinden und keinen fremden
 * Record durchreichen. Ein Block, der sich selbst ausblendet (null), bleibt hier drin und
 * verschwindet erst beim Rendern; das ist gewollt, denn „ist gerade leer" ist etwas anderes als
 * „ist abgeschaltet".
 */
export function orderedBlocks<S extends BlockSurface, T>(
  surface: S,
  nodes: Record<BlockIdOf<S>, T>,
): { id: BlockIdOf<S>; node: T }[] {
  return blocksOf(surface).map((b) => {
    const id = b.id as BlockIdOf<S>;
    return { id, node: nodes[id] };
  });
}
