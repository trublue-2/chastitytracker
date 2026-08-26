/**
 * Das Register der Dashboard-Blöcke: **welche Blöcke es gibt, auf welcher Oberfläche sie stehen,
 * wem sie gehören und in welcher Reihenfolge sie erscheinen.**
 *
 * Wozu: bis hierher war die Reihenfolge in `dashboard/page.tsx` fest verdrahtet — vierzehn Blöcke
 * hintereinander im JSX, ohne Namen und ohne Handhabe. Ein Block liess sich weder benennen noch
 * ausblenden noch verschieben, weil es ihn als *Ding* gar nicht gab, nur als Stelle im Baum.
 *
 * **Die Vollständigkeit erzwingt der Compiler, nicht ein Test.** Die Seite baut ihre Blöcke als
 * `Record<SubDashboardBlockId, …>` — ein vergessener Block ist ein Typfehler, ein erfundener
 * ebenso. Deshalb steht hier keine Komponente: das Register nennt und ordnet, die Seite rendert.
 * Wer beides mischt, holt sich die halbe Seite in eine Datei, die nur eine Liste sein will.
 *
 * **NICHT hier: die Datenbeschaffung** (seit Etappe B `load(ctx)` je Block, siehe
 * `blockStack.ts`). Sie könnte es auch gar nicht: dieses Modul wird von der Client-Komponente
 * `DashboardStack` importiert und muss deshalb frei von Server-Abhängigkeiten bleiben. Und die Ids
 * sind nicht global eindeutig — `boxStatus` gibt es auf zwei Oberflächen mit verschiedenen
 * Ladewegen. Die Block-Tabellen liegen deshalb je Oberfläche neben ihrer Seite.
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
   * Gesetzt, wenn der Block sich nicht abschalten lässt. Zwei Gründe, und beide sind keine
   * Bevormundung:
   *
   * 1. **Der Block ist kein Inhalt, sondern Gerüst** — die Überschrift der Statistik, ohne die die
   *    Auswertung ohne Anfang begänne.
   * 2. **Der Block trägt eine FRIST.** Er steht ohnehin nur da, wenn etwas offen ist; die übrige
   *    Zeit ist er leer. Genau das macht ihn gefährlich abschaltbar: wer ihn wegschaltet, WEIL er
   *    leer aussieht, bekommt Wochen später die überfällige Kontrolle nicht mehr zu sehen und
   *    erwirbt Strafen für etwas, das ihm nie angezeigt wurde. Ein Block, dessen Abwesenheit
   *    Konsequenzen hat, darf nicht stumm verschwinden können.
   *
   * Betrifft NUR die Sichtbarkeit, nicht die Reihenfolge: ein `alwaysOn`-Block lässt sich weiterhin
   * beliebig verschieben — er muss stehen, nicht oben stehen.
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
  // `alwaysOn`, weil hier die überfällige Kontrolle samt „Jetzt erfassen“ steht — siehe die
  // Begründung an `DashboardBlockDef.alwaysOn`.
  { id: "alerts", surface: "subDashboard", role: "sub", labelKey: "blockAlerts", alwaysOn: true },
  { id: "boxStatus", surface: "subDashboard", role: "sub", labelKey: "blockBoxStatus" },
  { id: "openTasks", surface: "subDashboard", role: "sub", labelKey: "blockOpenTasks" },
  { id: "openPenalties", surface: "subDashboard", role: "sub", labelKey: "blockOpenPenalties" },
  { id: "weightRelease", surface: "subDashboard", role: "sub", labelKey: "blockWeightRelease" },
  { id: "runningSession", surface: "subDashboard", role: "sub", labelKey: "blockRunningSession" },
  { id: "activeWearSessions", surface: "subDashboard", role: "sub", labelKey: "blockActiveWear" },
  { id: "incompleteCategories", surface: "subDashboard", role: "sub", labelKey: "blockIncompleteCategories" },
  { id: "categoryGoals", surface: "subDashboard", role: "sub", labelKey: "blockCategoryGoals" },
  { id: "inactiveCategories", surface: "subDashboard", role: "sub", labelKey: "blockInactiveCategories" },
  { id: "statusAndStats", surface: "subDashboard", role: "sub", labelKey: "blockStatusAndStats" },
  // Die Werbung steht bewusst HINTER `statusAndStats` — dort sitzt der Willkommen-Block eines
  // leeren Kontos. Davor gestellt bewarb der erste Bildschirm der App eine Zusatzfunktion
  // („Tracke mehr als nur KG"), bevor er die Grundfunktion erklärte: wer neu ist, weiss noch
  // nicht, was ein Eintrag ist, und wurde als Erstes eingeladen, Kategorien zu verwalten.
  { id: "categoriesPromo", surface: "subDashboard", role: "sub", labelKey: "blockCategoriesPromo" },
  { id: "sessionList", surface: "subDashboard", role: "sub", labelKey: "blockSessionList" },
  { id: "wearSessionList", surface: "subDashboard", role: "sub", labelKey: "blockWearSessionList" },
  { id: "taskList", surface: "subDashboard", role: "sub", labelKey: "blockTaskList" },
] as const satisfies readonly DashboardBlockDef[];

export type SubDashboardBlockId = (typeof SUB_DASHBOARD_BLOCKS)[number]["id"];


/**
 * Die Statistik-Seite. **Zweimal dasselbe Bauteil, zwei Oberflächen:** `StatsMain` trägt sowohl
 * `/dashboard/stats` (der Träger sieht sich) als auch `/admin/users/[id]/stats` (die Keyholderin
 * sieht einen Sub). Konfiguriert wird sie je Betrachter getrennt — deshalb zwei Oberflächen mit
 * denselben Block-Namen und nicht eine.
 */
const STATS_BLOCKS = [
  { id: "heading", labelKey: "blockStatsHeading", alwaysOn: true },
  { id: "overview", labelKey: "blockStatsOverview" },
  { id: "orgasmFree", labelKey: "blockStatsOrgasmFree" },
  { id: "activeSession", labelKey: "blockStatsActiveSession" },
  { id: "goals", labelKey: "blockStatsGoals" },
  { id: "calendar", labelKey: "blockStatsCalendar" },
  { id: "yearHeatmap", labelKey: "blockStatsYearHeatmap" },
  { id: "records", labelKey: "blockStatsRecords" },
  { id: "deviceUsage", labelKey: "blockStatsDeviceUsage" },
  { id: "inspections", labelKey: "blockStatsInspections" },
  { id: "weight", labelKey: "blockStatsWeight" },
  { id: "monthStats", labelKey: "blockStatsMonths" },
  { id: "unlawfulOpenings", labelKey: "blockStatsUnlawful" },
] as const;

/** Beide Statistik-Oberflächen teilen sich die Block-Namen — der Typ deshalb auch. */
export type StatsBlockId = (typeof STATS_BLOCKS)[number]["id"];

/** Stempelt Oberfläche und Rolle auf die geteilte Liste — zweimal dieselben zwölf Einträge
 *  abzuschreiben wäre eine Kopie, die beim ersten neuen Block auseinanderläuft. */
function statsBlocksFor(surface: BlockSurface, role: "sub" | "keyholder"): readonly DashboardBlockDef[] {
  return STATS_BLOCKS.map((b) => ({ ...b, surface, role }));
}

export const SUB_STATS_BLOCKS = statsBlocksFor("subStats", "sub");
export const KEYHOLDER_STATS_BLOCKS = statsBlocksFor("keyholderStats", "keyholder");

/** Die Sub-Detailseite der Keyholderin — ihr Gegenstück zum Träger-Dashboard. */
export const KEYHOLDER_SUB_BLOCKS = [
  { id: "boxStatus", surface: "keyholderSub", role: "keyholder", labelKey: "blockBoxStatus" },
  { id: "tasks", surface: "keyholderSub", role: "keyholder", labelKey: "blockOpenTasks" },
  { id: "sessionOrStatus", surface: "keyholderSub", role: "keyholder", labelKey: "blockRunningSession" },
  { id: "wearSessions", surface: "keyholderSub", role: "keyholder", labelKey: "blockActiveWear" },
  // Die beiden Fristen-Blöcke der Keyholderin: eine offene Kontrolle und eine wartende Anfrage
  // warten auf IHRE Entscheidung. Schaltet sie den leeren Block weg, wartet der Sub ins Leere.
  { id: "openInspection", surface: "keyholderSub", role: "keyholder", labelKey: "blockOpenInspection", alwaysOn: true },
  { id: "orgasmRequest", surface: "keyholderSub", role: "keyholder", labelKey: "blockOrgasmRequest", alwaysOn: true },
  { id: "statsCompact", surface: "keyholderSub", role: "keyholder", labelKey: "blockStatusAndStats" },
  { id: "goalOverview", surface: "keyholderSub", role: "keyholder", labelKey: "blockStatsGoals" },
  { id: "categoryGoals", surface: "keyholderSub", role: "keyholder", labelKey: "blockCategoryGoals" },
  { id: "sessionList", surface: "keyholderSub", role: "keyholder", labelKey: "blockSessionList" },
  { id: "wearSessionList", surface: "keyholderSub", role: "keyholder", labelKey: "blockWearSessionList" },
  { id: "taskList", surface: "keyholderSub", role: "keyholder", labelKey: "blockTaskList" },
  { id: "inspectionHistory", surface: "keyholderSub", role: "keyholder", labelKey: "blockStatsInspections" },
  { id: "orgasmList", surface: "keyholderSub", role: "keyholder", labelKey: "blockOrgasmList" },
] as const satisfies readonly DashboardBlockDef[];

export type KeyholderSubBlockId = (typeof KEYHOLDER_SUB_BLOCKS)[number]["id"];

/** Alle Blöcke aller Oberflächen. Wächst mit jeder Oberfläche, die dazukommt. */
export const DASHBOARD_BLOCKS: readonly DashboardBlockDef[] = [
  ...SUB_DASHBOARD_BLOCKS, ...SUB_STATS_BLOCKS, ...KEYHOLDER_STATS_BLOCKS, ...KEYHOLDER_SUB_BLOCKS,
];

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
export type BlockIdOf<S extends BlockSurface> =
  S extends "subDashboard" ? SubDashboardBlockId
  : S extends "subStats" | "keyholderStats" ? StatsBlockId
  : S extends "keyholderSub" ? KeyholderSubBlockId
  : never;
