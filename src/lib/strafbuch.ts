import { prisma } from "@/lib/prisma";
import { deployCutoff } from "@/lib/appMeta";
import { mapAnforderungStatus, tzDayKey, isPastDeadlineUnfulfilled, dateAtLocalMinutes, APP_TZ } from "@/lib/utils";
import { cleaningBlockReason, type CleaningPermissionUser } from "@/lib/queries";
import { aktivesReinigungsFenster, CLEANING_USER_SELECT } from "@/lib/reinigungService";
import { hhmmToMinutes } from "@/lib/autoKontrolleService";
import { evaluateTasks, SUB_VISIBLE_WHERE, TASK_INCLUDE } from "@/lib/taskIntervals";
import { isTaskOffense, type TaskOffenseState } from "@/lib/tasks";
import { triggeredWhere, isHiddenFromSub } from "@/lib/delayedTrigger";
import { isSwitchableOffenseType, offenseRuleResolver, validOffenseRuleChanges, type OffenseRuleResolver } from "@/lib/offenseRules";
import {
  CLEANING_RULE_CHANGE_SELECT, cleaningPermissionUserAt, cleaningRulesFrom, reinigungRulesAt,
  type CleaningSettingsResolver,
} from "@/lib/cleaningRules";
import type { OffenseCanonicalType } from "@/lib/offenseTypes";

/** A Kontroll-based offense (late or rejected) — raw data, formatting left to consumers. */
export interface StrafbuchControlOffense {
  id: string;
  /** null = Kontrolle ohne Code-Pflicht (Gerät mit `requireInspectionCode: false`). */
  code: string | null;
  deadline: Date;
  fulfilledAt: Date | null;
  entryStartTime: Date | null;
  /** True if the entry was backdated before the deadline but submitted after it. */
  backdated: boolean;
  kommentar: string | null;
  entryNote: string | null;
}

/** Raw Strafbuch data for a user — system-detected offenses + the punished-marker records.
 *  Pure data (Date objects); display formatting is the consumer's job. */
export interface StrafbuchData {
  unauthorizedOpenings: {
    id: string;
    startTime: Date;
    note: string | null;
    sperrzeitEndetAt: Date | null;
    sperrzeitIndefinite: boolean;
  }[];
  lateControls: StrafbuchControlOffense[];
  rejectedControls: StrafbuchControlOffense[];
  /** Kontrollen, deren Eskalations-Mahnung ignoriert wurde — System hat automatisch als abgelegt
   *  markiert (siehe inspectionEscalationService.ts). Nie zusammen mit lateControls/rejectedControls
   *  für dieselbe Zeile, da autoMarkedRemovedAt niemals mit gesetztem entryId koexistiert. */
  autoRemovedControls: StrafbuchControlOffense[];
  reinigungLimitViolations: {
    entryId: string;
    startTime: Date | null;
    note: string | null;
  }[];
  /** Lock entries where the user wore a different device than the Anforderung specified. */
  wrongDeviceViolations: {
    entryId: string;
    startTime: Date | null;
    note: string | null;
    deviceName: string | null;
  }[];
  /** Mandatory orgasm directives (ANWEISUNG) whose window ended without a matching orgasm. */
  missedOrgasmInstructions: {
    id: string;
    endetAt: Date;
    nachricht: string | null;
    requiredArt: string | null;
  }[];
  /** Verschluss-Anforderungen (lock requests) whose deadline (`endetAt`) passed without a timely VERSCHLUSS. */
  lateLocks: {
    id: string;
    endetAt: Date;
    fulfilledAt: Date | null;
    nachricht: string | null;
  }[];
  /** REINIGUNG-Öffnungen during an active, cleaning-permitted Sperrzeit whose re-lock deadline
   *  (active daily cleaning window's end, or open time + reinigungMaxMinuten as fallback) passed
   *  without (or with a late) following VERSCHLUSS. */
  cleaningNotRelocked: {
    entryId: string;
    startTime: Date;
    deadline: Date;
    relockAt: Date | null;
    note: string | null;
  }[];
  /** Aufgaben, die nicht erfüllt wurden. `state` allein sagt nicht, WAS schiefging — `missed` deckt
   *  drei verschiedene Vorwürfe ab; welchen, entscheidet `taskFailureKind` aus `startedAt` und
   *  `hasRequirements`. Wie alles hier LIVE abgeleitet — ein korrigierter Eintrag korrigiert auch
   *  das Vergehen. */
  unfulfilledTasks: {
    id: string;
    title: string;
    holdUntil: Date;
    state: TaskOffenseState;
    /** Die TATZEIT, und je Zustand eine andere: bei `aborted` fiel dann die Bedingung weg, bei
     *  `missed` verstrich dann die eigene Frist eines Nachweises. Wer sie anzeigt, muss den Zustand
     *  mitlesen — als „abgelegt am" beschriftet wirft sie dem Träger eine Handlung vor, die es nicht
     *  gab. */
    failedAt: Date | null;
    /** Ab wann alle Bedingungen gleichzeitig galten; `null` = nie. Zusammen mit
     *  {@link hasRequirements} der Vorwurf — siehe `taskFailureKind`. */
    startedAt: Date | null;
    /** Hatte die Aufgabe überhaupt Bedingungen? Eine ohne bekommt nie ein `startedAt`, und ohne
     *  diese Angabe würde ihr „nicht begonnen" vorgeworfen. */
    hasRequirements: boolean;
    /** `refId` des Vergehens, dessen Strafe diese Aufgabe war — aus `StrafeRecord.taskId`. Null bei
     *  gewöhnlichen Aufgaben. Macht die Kette sichtbar: eine versäumte Strafe erzeugt ein neues
     *  Vergehen, und das soll man ihm ansehen. */
    penaltyForRef: string | null;
    /** Anlass-Freitext der Aufgabe, wo einer gesetzt ist — Zusatz zur Kette, nicht ihr Beleg. */
    penaltyReason: string | null;
  }[];
  /** Passwortwechsel an einem Admin-Konto, während für diesen Sub eine Sperrzeit lief. Anders als
   *  alle anderen Vergehen NICHT live abgeleitet, sondern beim Vorgang festgeschrieben
   *  (`AdminPasswordChange`) — eine später zurückgezogene Sperrzeit darf das Vergehen nicht
   *  rückwirkend tilgen. */
  adminPasswordChanges: {
    id: string;
    at: Date;
    adminUsername: string;
    via: string;
    sperrzeitEndetAt: Date | null;
  }[];
  /** ORGASMUS-Einträge ohne deckende Orgasmus-Direktive. Ob und in welcher Reichweite das zählt,
   *  entscheidet die Regel `unauthorized_orgasm` (aus / nur bei Sperrzeit / immer) — Default ist AUS,
   *  ein Update hängt also niemandem rückwirkend ein Vergehen an. */
  unauthorizedOrgasms: {
    id: string;
    startTime: Date;
    orgasmusArt: string | null;
    note: string | null;
    /** Die zur Tatzeit laufende Sperrzeit, wenn es eine gab — sonst null (Modus `always`). */
    sperrzeitEndetAt: Date | null;
    sperrzeitIndefinite: boolean;
  }[];
  /** Von Hand notierte Vergehen (`ManualOffense`) — als einzige nicht abgeleitet. */
  manualOffenses: {
    id: string;
    occurredAt: Date;
    title: string;
    description: string | null;
    createdBy: string;
  }[];
  /** Judgment records — each marks an offense (by `refId`) as PUNISHED or DISMISSED. */
  strafeRecords: {
    refId: string;
    offenseType: string;
    status: string; // "PUNISHED" | "DISMISSED"
    bestraftDatum: Date;
    notiz: string | null;
    reason: string | null;
    judgedBy: string | null;
    erledigtAt: Date | null;
    /** Die Aufgabe, die als Strafe gestellt wurde (`punishWithTask`) — null beim Freitext-Weg. Die
     *  Strafen-Sicht des Trägers braucht sie, um eine Strafe, die schon als Aufgabe auf dem
     *  Dashboard steht, nicht ein zweites Mal in voller Länge zu zeigen. */
    taskId: string | null;
  }[];
}

/** cleaning_not_relocked shares its underlying OEFFNEN entry with cleaning_limit (both can fire on
 *  the same REINIGUNG opening — over the daily quota AND not relocked in time). StrafeRecord.refId
 *  is globally `@unique`, so the two offenses need disjoint ref namespaces — prefixed here rather
 *  than using the bare entry id.
 *
 *  Liegt hier und nicht mehr in `strafurteilService.ts`, weil die ref-Tabelle unten (OFFENSE_LISTS)
 *  sie braucht und jener Service dieses Modul importiert — andersherum gäbe es einen Zyklus. Dort
 *  re-exportiert, damit die bestehenden Importeure unverändert bleiben. */
export function cleaningNotRelockedRef(entryId: string): string {
  return `relock:${entryId}`;
}
export function entryIdFromCleaningNotRelockedRef(refId: string): string | null {
  return refId.startsWith("relock:") ? refId.slice("relock:".length) : null;
}

/**
 * Die Spalten der VERSCHLUSS-/OEFFNEN-Historie, die das Strafbuch tatsächlich liest.
 *
 * Diese beiden Abfragen sind unbegrenzt — sie holen jede Öffnung und jeden Verschluss, den es je
 * gab, weil die Reinigungs-Kontingent-Prüfung gegen den HEUTIGEN Wert über die ganze Historie
 * zählt. Ohne `select` kam damit jede Zeile mit allen 24 Spalten, inklusive Bildpfad, EXIF-Zeit,
 * Kontrollcode und Verifikations-Feldern — Daten, die hier niemand anfasst, aber bei einem
 * langjährigen Nutzer den Löwenanteil der übertragenen Bytes ausmachen. `evaluateTasks` macht es
 * für dieselben Zeilen längst richtig (`taskIntervals.ts`, der Fallback-Zweig von `kgEntries`).
 *
 * Wer hier ein Feld ergänzt, muss es auch brauchen — und wer eines wegnimmt, bekommt einen
 * Compile-Fehler statt eines stillen Falschergebnisses: die Reinigungs-Helfer nehmen ihre Zeile
 * strukturell entgegen (`{ oeffnenGrund, startTime }`), und `kgEntries` verlangt `KgEntry`.
 *
 * `note` und `source` liest nur der OEFFNEN-Zweig; sie stehen trotzdem in beiden Abfragen, weil die
 * zwei Listen zusammengeworfen an `evaluateTasks` gehen und zwei verschiedene Zeilenformen dort nur
 * eine Union erzeugen würden, die niemand braucht.
 */
const KG_ENTRY_SELECT = {
  id: true,
  type: true,
  startTime: true,
  oeffnenGrund: true,
  note: true,
  source: true,
} as const;

/** Nur die drei Felder, die `offenseRuleResolver` liest. Bewusst dieselben wie `CHANGE_SELECT` in
 *  `offenseRulesService.ts` — dort steht die Schreib-Seite; hier darf keine breitere Zeile geladen
 *  werden, nur weil es bequem ist. Kein `orderBy`: der Resolver sortiert je Art selbst. */
const OFFENSE_RULE_CHANGE_SELECT = { offenseType: true, mode: true, effectiveFrom: true } as const;

/** Der Zeilentyp einer Vergehens-Liste in {@link StrafbuchData}. */
type OffenseListRow<K extends keyof StrafbuchData> = StrafbuchData[K] extends (infer R)[] ? R : never;

/** Der eigene ANLASS-Text einer Vergehens-Zeile, wo die Art einen trägt. */
export interface OffenseDetail {
  /** Der Anlass in einer Zeile — Titel des notierten Vergehens bzw. der Aufgabe. */
  title: string | null;
  /** Der ausführliche Text dazu, wo einer erfasst wurde. */
  description: string | null;
  /**
   * WER dieses Vergehen festgehalten hat — Audit-Kennung wie `StrafeRecord.judgedBy`: der
   * Benutzername des Menschen, oder das Kürzel `"ai"` für den Weg über den MCP.
   *
   * Nur ein von Hand NOTIERTES Vergehen hat einen Autor; abgeleitete stellt die App selbst fest, und
   * dort ist `null` die richtige Antwort und nicht eine fehlende. Deshalb ist das Feld PFLICHT und
   * nicht optional — wer ihn verliert, meldet dem Träger wieder „System" (v5.1).
   *
   * SOWEIT der Compiler reicht, und das ist weniger, als es aussieht: die Pflicht trifft nur die
   * Arten, die überhaupt ein `detail` mitbringen (heute zwei von dreizehn). Eine neue Art OHNE
   * `detail` bekommt in `selectSubOffenses` stillschweigend `recordedBy: null`, ohne dass Compiler
   * oder Test etwas sagen. Für abgeleitete Arten ist das genau richtig; eine neue Art mit
   * MENSCHLICHEM Autor muss deshalb ein `detail` mitbringen — sonst greift hier nichts.
   */
  recordedBy: string | null;
}

/**
 * Wie aus einer Vergehens-Zeile ihre stabile `refId`, ihr Tatzeitpunkt und ihr Anlass-Text werden —
 * für JEDE Art, an EINER Stelle.
 *
 * Vorher stand diese Zuordnung nur in `collectDetectedOffenses`. Sobald eine zweite Stelle sie
 * braucht — und die Regel-Filterung unten braucht sie — entsteht sonst eine handgeführte Kopie, und
 * genau daran ist das Strafbuch schon zweimal gescheitert (der KERN-BUG vom 11.07., dazu die fünf
 * Arten, die bis v5.0.3 in keiner Anzeige auftauchten). Wer die refs braucht, LEITET sie hier ab.
 *
 * `detail` fehlt bei den meisten Arten, und das ist die Aussage: „Kontrolle zu spät" sagt schon
 * alles, ein Anlass wäre eine Wiederholung. Es steht hier statt beim Anzeiger, weil sonst DORT eine
 * Aufzählung der Arten mit eigenem Titel entstünde — und eine dritte solche Art bekäme still
 * `title: null`, ohne dass der Compiler oder ein Test sich meldet.
 */
const spec = <K extends keyof StrafbuchData>(
  key: K,
  ref: (row: OffenseListRow<K>) => string,
  at: (row: OffenseListRow<K>) => Date | null,
  detail?: (row: OffenseListRow<K>) => OffenseDetail,
) => ({ key, ref, at, detail });

export const OFFENSE_LISTS = {
  unauthorized_opening: spec("unauthorizedOpenings", (o) => o.id, (o) => o.startTime),
  late_control: spec("lateControls", (k) => k.id, (k) => k.entryStartTime ?? k.deadline),
  rejected_control: spec("rejectedControls", (k) => k.id, (k) => k.entryStartTime ?? k.deadline),
  auto_removed_control: spec("autoRemovedControls", (k) => k.id, (k) => k.entryStartTime ?? k.deadline),
  cleaning_limit: spec("reinigungLimitViolations", (v) => v.entryId, (v) => v.startTime),
  wrong_device: spec("wrongDeviceViolations", (v) => v.entryId, (v) => v.startTime),
  missed_orgasm: spec("missedOrgasmInstructions", (m) => m.id, (m) => m.endetAt),
  late_lock: spec("lateLocks", (a) => a.id, (a) => a.fulfilledAt ?? a.endetAt),
  cleaning_not_relocked: spec("cleaningNotRelocked", (c) => cleaningNotRelockedRef(c.entryId), (c) => c.relockAt ?? c.deadline),
  // refId = Task.id. Anders als bei den Reinigungs-Vergehen braucht es kein Präfix: die id gehört
  // keiner zweiten Vergehensart, und `StrafeRecord.refId` ist global eindeutig.
  // `recordedBy: null` — die versäumte Aufgabe stellt die App fest, nicht ein Mensch. Wer die Aufgabe
  // GESTELLT hat, ist eine andere Frage und wird nirgends festgehalten.
  unfulfilled_task: spec("unfulfilledTasks", (t) => t.id, (t) => t.failedAt ?? t.holdUntil,
    (t) => ({ title: t.title, description: null, recordedBy: null })),
  // refId ist die AdminPasswordChange-id: eigener Namensraum, kollidiert nicht mit Entry-/
  // Anforderungs-ids und bleibt stabil, auch wenn die Sperrzeit später zurückgezogen wird.
  admin_password_change: spec("adminPasswordChanges", (p) => p.id, (p) => p.at),
  unauthorized_orgasm: spec("unauthorizedOrgasms", (o) => o.id, (o) => o.startTime),
  manual_offense: spec("manualOffenses", (m) => m.id, (m) => m.occurredAt,
    (m) => ({ title: m.title, description: m.description, recordedBy: m.createdBy })),
} satisfies Record<OffenseCanonicalType, {
  key: keyof StrafbuchData;
  ref: (row: never) => string;
  at: (row: never) => Date | null;
  detail?: (row: never) => OffenseDetail;
}>;

/**
 * Die Vergehens-Listen eines Strafbuchs als einheitliche Sicht: je Art ihre Zeilen samt der beiden
 * Zugriffe aus {@link OFFENSE_LISTS}.
 *
 * Hier steht der Cast, den das Iterieren über eine je Art typisierte Tabelle unvermeidlich kostet —
 * EINMAL. `applyOffenseRules` unten und `collectDetectedOffenses` in `strafurteilService.ts`
 * brauchten ihn beide und hatten ihn beide ausgeschrieben; das ist genau die Sorte Kopie, gegen die
 * die Tabelle gebaut wurde.
 */
export function offenseListViews(sb: StrafbuchData) {
  const lists = sb as unknown as Record<string, unknown[]>;
  return Object.entries(OFFENSE_LISTS).map(([type, s]) => ({
    type: type as OffenseCanonicalType,
    key: s.key,
    rows: lists[s.key],
    ref: s.ref as (row: unknown) => string,
    at: s.at as (row: unknown) => Date | null,
    detail: s.detail as ((row: unknown) => OffenseDetail) | undefined,
  }));
}

/**
 * Streicht aus einem rohen Strafbuch jede Zeile, deren Vergehensart zur TATZEIT abgeschaltet war.
 *
 * Läuft über {@link OFFENSE_LISTS} statt über eine eigene Aufzählung: eine neue Vergehensart ist
 * damit automatisch regel-gebunden, statt still ungeprüft durchzurutschen.
 *
 * `judgedRefs` sind die bereits beurteilten Vergehen — sie bleiben stehen, egal was die Regel sagt.
 * Ein gefälltes Urteil ist die Aufzeichnung einer Entscheidung und darf nicht durch einen Schalter
 * aus der Welt fallen; sonst hinge ein `StrafeRecord` (samt womöglich einer Strafaufgabe) an einem
 * Vergehen, das keine Oberfläche mehr kennt.
 *
 * Zeilen ohne Zeitpunkt (`at` = null, etwa ein falsches Gerät, dessen Eintrag nicht mehr existiert)
 * werden nach der HEUTE geltenden Fassung beurteilt — mehr ist über sie nicht bekannt.
 */
function applyOffenseRules(
  sb: StrafbuchData,
  resolve: OffenseRuleResolver,
  judgedRefs: Set<string>,
  now: Date,
): void {
  const lists = sb as unknown as Record<string, unknown[]>;
  for (const { type, key, rows, ref, at } of offenseListViews(sb)) {
    // manual_offense hat bewusst keinen Schalter (Begründung in `offenseRules.ts`).
    if (!isSwitchableOffenseType(type)) continue;
    // `unauthorized_orgasm` hat seine Regel schon beim Ableiten gelesen — sie sagt dort nicht nur
    // ob, sondern WIE WEIT (nur bei Sperrzeit / immer), und das lässt sich hier nicht nachholen.
    // Ein zweiter Durchgang wäre für diese Art ein No-Op: was die Regel streichen würde, ist dort
    // längst gestrichen — und den Schutz beurteilter Zeilen bringt die Ableitung selbst mit
    // (`judgedRefs`, siehe dort).
    if (type === "unauthorized_orgasm") continue;
    lists[key] = rows.filter(
      (row) => judgedRefs.has(ref(row)) || resolve(type, at(row) ?? now) !== "off",
    );
  }
}

/**
 * REINIGUNG-Öffnungen über dem Tageskontingent — LIVE abgeleitet statt aus Auto-StrafeRecords: eine
 * solche Öffnung ist eine ERKENNUNG; ob sie bestraft wird, entscheidet die Keyholderin.
 *
 * Das Kontingent kommt aus der Fassung DIESER Öffnung, nicht aus der heutigen (`0` = unbegrenzt,
 * also nie ein Verstoss). Gezählt wird trotzdem durchgehend: an einem Tag, dessen Kontingent
 * mittendrin gesenkt wurde, zählen die Öffnungen davor mit — sonst begänne das Kontingent von vorn.
 *
 * `quotaEverSet` ist die Abkürzung für den Regelfall: hat dieser Sub nie ein Kontingent gehabt
 * (Spalten-Default 0, keine Zeile in der Historie), kann keine Öffnung eines sein — dann entfallen
 * Filter, Sortierung und Schleife über den ganzen Bestand.
 */
function cleaningLimitViolations(
  oeffnungen: { id: string; startTime: Date; oeffnenGrund: string | null; note: string | null }[],
  cleaningAt: CleaningSettingsResolver,
  subTz: string,
  quotaEverSet: boolean,
): { entryId: string; startTime: Date | null; note: string | null }[] {
  if (!quotaEverSet) return [];
  const violations: { entryId: string; startTime: Date | null; note: string | null }[] = [];
  const perDay = new Map<string, number>();
  const reinigungAsc = oeffnungen
    .filter((o) => o.oeffnenGrund === "REINIGUNG")
    .slice()
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  for (const o of reinigungAsc) {
    // Sub-Tag, nicht CH-Tag — dieselbe Grenze, die `reinigungVerbrauchtHeute` (midnightInTZ mit
    // der Sub-Zeitzone) beim Zählen auf der Box-Karte zieht.
    const key = tzDayKey(o.startTime, subTz);
    const n = (perDay.get(key) ?? 0) + 1;
    perDay.set(key, n);
    const maxPerDay = cleaningAt(o.startTime).maxPerDay;
    if (maxPerDay > 0 && n > maxPerDay) violations.push({ entryId: o.id, startTime: o.startTime, note: o.note });
  }
  return violations.reverse(); // neueste zuerst (Anzeige)
}

/** True if a Verschluss-Anforderung (lock request) deadline has passed without a timely
 *  VERSCHLUSS — still open past `endetAt`, or fulfilled after `endetAt`. */
export function isLateLock(a: { endetAt: Date; fulfilledAt: Date | null }, now: Date): boolean {
  return isPastDeadlineUnfulfilled(a.endetAt, a.fulfilledAt, now);
}

/** Re-lock deadline for a REINIGUNG-Öffnung: the end of the active daily cleaning window (`fenster`)
 *  if one was open at `openStartTime`, else open time + the user's max minutes per pause. A window
 *  configured but not covering `openStartTime` also falls back to `maxMinuten` — never silently
 *  skipped, since that case isn't otherwise detected as an offense. Windows never span midnight
 *  (`parseReinigungsFenster` requires start < end), so the window end is always the same calendar
 *  day as `openStartTime`. `dateAtLocalMinutes` resolves the window-end wall-clock time DST-safely
 *  (a flat millisecond offset from midnight would be wrong on the ~2 days/year a DST transition
 *  falls between midnight and the window end). */
export function reinigungRelockDeadline(openStartTime: Date, maxMinuten: number, fenster: unknown, tz: string): Date {
  const windowEnd = aktivesReinigungsFenster(fenster, openStartTime, tz);
  if (windowEnd) return dateAtLocalMinutes(openStartTime, hhmmToMinutes(windowEnd), tz);
  return new Date(openStartTime.getTime() + maxMinuten * 60 * 1000);
}

/** True if a REINIGUNG-Öffnung was not (or too late) followed by a VERSCHLUSS within `deadline`. */
export function isCleaningNotRelocked(deadline: Date, relockAt: Date | null, now: Date): boolean {
  return isPastDeadlineUnfulfilled(deadline, relockAt, now);
}

/** Finds the Sperrzeit active at `openTime` (if any) — shared by unauthorizedOpenings and
 *  cleaningNotRelocked, which both need to know whether an OEFFNEN fell inside an active lock period. */
function findActiveSperrzeit<S extends { createdAt: Date; endetAt: Date | null; withdrawnAt: Date | null }>(
  openTime: Date, sperrzeiten: S[],
): S | undefined {
  return sperrzeiten.find((s) =>
    openTime >= s.createdAt &&
    (s.endetAt === null || openTime < s.endetAt) &&
    (s.withdrawnAt === null || s.withdrawnAt > openTime),
  );
}

/** AppMeta-Schlüssel des Stichtags. Die Zeile schreibt die Migration
 *  `20260714210000_cleaning_window_enforced_from` beim ersten Boot dieser Instanz. */
const ENFORCED_FROM_KEY = "cleaningWindowEnforcedFrom";

/**
 * Ab wann gilt das Reinigungsfenster als Schranke? Bis zu diesem Zeitpunkt prüfte weder die
 * Durchsetzung noch das Strafbuch, ob eine Reinigungsöffnung in einem Fenster lag — sie war
 * schlicht erlaubt. Das Strafbuch ist eine LIVE-Ableitung aus den Einträgen: ohne Stichtag würden
 * mit dem Deploy rückwirkend Vergehen für Handlungen erscheinen, die zur Zeit der Tat erlaubt waren.
 * Niemand soll für eine Regel belangt werden, die es damals nicht gab.
 *
 * Der Stichtag ist ein Merkmal des DEPLOYS, nicht des CODES: dasselbe Image läuft auf 27 Instanzen,
 * die es zu verschiedenen Zeitpunkten bekommen. Deshalb steht er in der DB (`AppMeta`), geschrieben
 * von der Migration beim ERSTEN Boot dieser Instanz — dem einzigen Zeitpunkt, den keine Vorhersage
 * treffen muss. Ein einkompiliertes Datum stand zwangsläufig auf dem Tag EINER Instanz und hätte
 * allen anderen beim Rollout rückwirkend Vergehen für die Differenz beschert.
 *
 * `CLEANING_WINDOW_ENFORCED_FROM` (ISO-8601) übersteuert die Zeile — für bewusstes Rückdatieren
 * oder Korrigieren. Ohne beides (Zeile fehlt, Migration nie gelaufen) gilt der SICHERE Weg: `now`,
 * also ab jetzt — lieber ein Vergehen zu wenig als eines, das es damals nicht gab.
 */
export function cleaningWindowEnforcedFrom(now: Date): Promise<Date> {
  return deployCutoff(now, {
    key: ENFORCED_FROM_KEY,
    envVar: "CLEANING_WINDOW_ENFORCED_FROM",
    logPrefix: "[strafbuch]",
    fallbackNote: "bewerte ab jetzt, keine rückwirkenden Vergehen",
  });
}

/** True if a REINIGUNG opening inside `sperre` doesn't break the Sperrzeit. Delegates to
 *  {@link cleaningBlockReason} — the same rule the live enforcement applies — rather than restating
 *  it. Restating it is exactly how the cleaning WINDOW went missing here: an opening outside the
 *  window withdrew the Sperrzeit but was booked as neither an unauthorized opening nor anything
 *  else. The lock broke and nothing was recorded.
 *
 *  Evaluated at the opening's own `startTime`, not at `now`: the Strafbuch keeps a record of the
 *  past. (Live enforcement judges `now`, because that is when the bolt actually moves.) Öffnungen
 *  vor `enforcedFrom` (siehe {@link cleaningWindowEnforcedFrom}) werden ohne Fenster-Prüfung
 *  beurteilt.
 *
 *  Shared by unauthorizedOpenings (inverted: an opening that ISN'T allowed is unauthorized) and
 *  cleaningNotRelocked (only allowed openings can incur a missed-re-lock offense). */
function isAllowedReinigungOpening(
  o: { oeffnenGrund: string | null; startTime: Date },
  sperre: { reinigungErlaubt: boolean } | undefined,
  user: CleaningPermissionUser,
  enforcedFrom: Date,
): boolean {
  if (!sperre || o.oeffnenGrund !== "REINIGUNG") return false;
  const grandfathered = o.startTime < enforcedFrom;
  const effectiveUser = grandfathered ? { ...user, reinigungsFenster: null } : user;
  return cleaningBlockReason(effectiveUser, [sperre], o.startTime) === null;
}

/**
 * Die Frist, bis zu der eine Reinigungsöffnung wieder verschlossen sein muss, DAMIT SIE KEIN
 * VERGEHEN WIRD — oder `null`, wenn für diese Öffnung gar keine solche Pflicht besteht.
 *
 * `null` heisst also nicht „erledigt", sondern „hier gilt diese Pflicht nicht": kein aktiver
 * Sperrzeit-Kontext, Reinigung nicht erlaubt, ausserhalb der Fenster, oder die Sperrzeit endet vor
 * der Frist (dann bleibt nichts mehr zu verletzen).
 *
 * NICHT zu verwechseln mit {@link import("./utils").cleaningInterruptionDeadline} — der Frist, bis
 * zu der ein Wiederverschluss die Session fortführt. Die hier ist strenger im Zugang (nur unter
 * Sperrzeit) und zugleich grosszügiger in der Dauer (bei konfigurierten Fenstern bis ans
 * Fensterende, also möglicherweise Stunden). Als Countdown im Dashboard gezeigt, verspräche sie
 * dem Sub Zeit, die das Session-Modell längst nicht mehr gibt.
 */
export function cleaningRelockObligation(
  opening: { oeffnenGrund: string | null; startTime: Date },
  sperre: { reinigungErlaubt: boolean; endetAt: Date | null } | null,
  user: CleaningPermissionUser,
  maxMinuten: number,
  enforcedFrom: Date,
): Date | null {
  if (!sperre || !isAllowedReinigungOpening(opening, sperre, user, enforcedFrom)) return null;
  const deadline = reinigungRelockDeadline(opening.startTime, maxMinuten, user.reinigungsFenster, user.timezone);
  const sperrzeitCoversDeadline = sperre.endetAt === null || sperre.endetAt >= deadline;
  return sperrzeitCoversDeadline ? deadline : null;
}

/** Computes the Strafbuch for a user: unauthorized openings during Sperrzeiten, late and
 *  rejected Kontrollen, REINIGUNG-limit violations, late locks, missed cleaning re-locks, plus
 *  the punished-marker records. Single source of truth shared by the admin Strafbuch page and the MCP tool. */
export async function buildStrafbuch(userId: string, now: Date = new Date()): Promise<StrafbuchData> {
  // Die Regel-Historie ZUERST, allein: sie ist winzig und indiziert, entscheidet aber, ob die
  // Orgasmus-Historie unten überhaupt gebraucht wird. Der Default dieser Art ist `off` — ohne diese
  // Vorabfrage lädt JEDES Strafbuch (Admin-Seite, get_offenses, jedes judge_offense) die
  // vollständige Orgasmus-Historie eines Nutzers und wirft sie eine Zeile später weg.
  const offenseRuleChanges = await prisma.offenseRuleChange.findMany({ where: { userId }, select: OFFENSE_RULE_CHANGE_SELECT });

  // Ab wann war `unauthorized_orgasm` je scharf? `undefined` = nie — dann braucht es die Einträge
  // gar nicht. Das ist zugleich die äussere Grenze des Urteils-Schutzes weiter unten: wer die
  // scharfstellende Zeile von Hand aus der DB löscht, statt eine `off`-Zeile davorzusetzen, nimmt
  // auch beurteilten Vergehen ihren Anlass. Über die App geht das nicht — `setOffenseRule` legt nur
  // an. Sonst reicht alles ab diesem Zeitpunkt: davor gilt zwingend der Default `off`, und
  // die Ableitung unten verwirft diese Einträge ohnehin. Der Filter ist damit verlustfrei.
  const orgasmRuleArmedFrom = validOffenseRuleChanges(offenseRuleChanges)
    .filter((c) => c.offenseType === "unauthorized_orgasm" && c.mode !== "off")
    .reduce<Date | undefined>((min, c) => (!min || c.effectiveFrom < min ? c.effectiveFrom : min), undefined);

  // Der Stichtag hängt im selben Promise.all wie alles andere — einmal je Strafbuch, nicht je
  // Öffnung, und ohne zusätzlichen Roundtrip.
  const [enforcedFrom, cleaningRuleChanges, user, oeffnungen, verschluesse, sperrzeiten, lockRequests, kontrollAnforderungen, strafeRecordsRaw, orgasmusAnforderungen, tasks, adminPasswordChangesRaw, orgasmusEintraege, manualOffensesRaw] = await Promise.all([
    cleaningWindowEnforcedFrom(now),
    prisma.cleaningRuleChange.findMany({ where: { userId }, select: CLEANING_RULE_CHANGE_SELECT }),
    prisma.user.findUnique({ where: { id: userId }, select: { ...CLEANING_USER_SELECT, timezone: true } }),
    prisma.entry.findMany({ where: { userId, type: "OEFFNEN" }, orderBy: { startTime: "desc" }, select: KG_ENTRY_SELECT }),
    prisma.entry.findMany({ where: { userId, type: "VERSCHLUSS" }, orderBy: { startTime: "asc" }, select: KG_ENTRY_SELECT }),
    prisma.verschlussAnforderung.findMany({ where: { userId, art: "SPERRZEIT", ...triggeredWhere(now) } }),
    prisma.verschlussAnforderung.findMany({ where: { userId, art: "ANFORDERUNG", withdrawnAt: null, ...triggeredWhere(now) } }),
    prisma.kontrollAnforderung.findMany({
      where: { userId, OR: [{ entryId: { not: null } }, { autoMarkedRemovedAt: { not: null } }] },
      include: { entry: true, autoMarkedEntry: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.strafeRecord.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.orgasmusAnforderung.findMany({ where: { userId } }),
    // Zurückgezogene bleiben draussen: ein Rückzug ist der Entschluss der Keyholderin, kein
    // Versäumnis des Subs, und darf nie zu einem Vergehen werden.
    // Eine noch nicht ausgelöste Aufgabe kann kein Vergehen sein — der Träger weiss nichts von ihr.
    // Ihre Fristen liegen zwar per Konstruktion in der Zukunft (`checkTask` erzwingt das), aber
    // genau darauf soll sich das Strafbuch nicht verlassen: stünde der Minuten-Tick lange still,
    // alterte die Zeile in die Vergangenheit und würde zum Versäumnis für etwas, das nie ankam.
    prisma.task.findMany({ where: { userId, withdrawnAt: null, ...SUB_VISIBLE_WHERE }, include: TASK_INCLUDE }),
    prisma.adminPasswordChange.findMany({ where: { subUserId: userId }, orderBy: { createdAt: "desc" } }),
    orgasmRuleArmedFrom
      ? prisma.entry.findMany({
          where: { userId, type: "ORGASMUS", startTime: { gte: orgasmRuleArmedFrom } },
          orderBy: { startTime: "desc" },
          select: { id: true, startTime: true, orgasmusArt: true, note: true },
        })
      : Promise.resolve([]),
    // Zurückgezogene bleiben draussen — gleiche Begründung wie bei den Aufgaben: der Rückzug ist die
    // Korrektur des Keyholders an seiner eigenen Notiz.
    prisma.manualOffense.findMany({ where: { userId, withdrawnAt: null }, orderBy: { occurredAt: "desc" } }),
  ]);

  // Öffnungen, Verschlüsse und die Reinigungs-Regeln liegen aus demselben Promise.all vor —
  // durchreichen statt neu laden. Trage-Einträge lädt das Strafbuch nicht; `wearEntries` bleibt
  // deshalb bewusst offen, damit `evaluateTasks` sie selbst holt statt sie für leer zu halten.
  const subTz = user?.timezone ?? APP_TZ;
  /** Die Reinigungs-Regeln in der Fassung ZUR TATZEIT statt im heutigen Stand — Begründung am
   *  Modell `CleaningRuleChange`. Jede der drei Ableitungen unten fragt sie am Zeitpunkt IHRER
   *  Öffnung. */
  const cleaningAt: CleaningSettingsResolver = cleaningRulesFrom(cleaningRuleChanges, user);
  /** Galt bei diesem Sub je ein Tageskontingent? Meist nein (Spalten-Default 0) — siehe
   *  {@link cleaningLimitViolations}. */
  const quotaEverSet = (user?.reinigungMaxProTag ?? 0) > 0 || cleaningRuleChanges.some((c) => c.maxPerDay > 0);

  // Aufgabe → Vergehen, dessen Strafe sie ist. Aus den ohnehin geladenen Urteils-Zeilen, also ohne
  // eine einzige zusätzliche Abfrage.
  const penaltyTaskOrigin = new Map(
    strafeRecordsRaw.flatMap((r) => (r.taskId ? [[r.taskId, r.refId] as const] : [])),
  );

  const unfulfilledTasks = (await evaluateTasks(userId, tasks, now, {
    kgEntries: [...oeffnungen, ...verschluesse],
    // Auch hier die Fassung von damals: sonst zerfiele eine Aufgabe rückwirkend an einer
    // Reinigungspause, die zu ihrer Zeit erlaubt war, und würde zum Vergehen „nicht erfüllt".
    reinigung: reinigungRulesAt(cleaningAt),
  }))
    .sort((a, b) => b.task.holdUntil.getTime() - a.task.holdUntil.getTime())
    // `flatMap` statt `filter` + `map`: der Type-Guard verengt `e.evaluation.state` nur INNERHALB
    // seines eigenen Zweigs. Über `filter` bliebe `e` ungenarrowed (der Guard greift auf ein
    // verschachteltes Feld, nicht auf das Element), und die Zuweisung bräuchte wieder einen Cast —
    // der einen dritten Vergehens-Zustand genauso still verschluckte wie zuvor.
    .flatMap((e) => isTaskOffense(e.evaluation.state)
      ? [{
          id: e.task.id,
          title: e.task.title,
          // Das WIRKSAME Ende: es datiert das Vergehen (`unfulfilled_task` nimmt `failedAt ??
          // holdUntil` als Tatzeit) und steht in der Strafbuch-Zeile. Im Dauer-Modus liegt das
          // gespeicherte `holdUntil` bis zu eine Kulanzfrist später — das Vergehen wäre auf einen
          // Zeitpunkt datiert, zu dem längst alles entschieden war.
          holdUntil: e.evaluation.holdUntil,
          state: e.evaluation.state,
          failedAt: e.evaluation.failedAt,
          startedAt: e.evaluation.startedAt,
          hasRequirements: e.task.requirements.length > 0,
          // Die KETTE: war diese Aufgabe die Strafe für ein früheres Vergehen, ist ihr Versäumnis ein
          // Vergehen, das aus jenem entstanden ist. Wer sie erneut bestraft, dreht eine Spirale und
          // soll das sehen.
          //
          // Die Quelle ist die VERKNÜPFUNG (`StrafeRecord.taskId`), nicht der Anlass-Freitext: den
          // setzt nur das Web-Formular über seine Vorbelegung. Eine Strafaufgabe des Keyholder-Agenten
          // (`create_task` mit `offenseRef`) hat gar keinen — die Kette wäre auf genau dem Weg
          // unsichtbar, der sie am ehesten braucht. Der Text kommt als Zusatz mit, wo er da ist.
          penaltyForRef: penaltyTaskOrigin.get(e.task.id) ?? null,
          penaltyReason: e.task.penaltyReason,
        }]
      : []);

  // Windows that explicitly permit opening to perform the directed orgasm — an OEFFNEN inside
  // such a window is not an unauthorized opening (like the REINIGUNG exception).
  /** Deckt dieses Orgasmus-Fenster den Zeitpunkt? Ein vor dem Zeitpunkt zurückgezogenes Fenster
   *  deckt nichts mehr — und ein zu diesem Zeitpunkt noch nicht AUSGELÖSTES auch nicht: eine
   *  terminierte Anweisung ist für den Träger nicht da, sie kann ihm also weder eine Öffnung
   *  erlauben noch einen Orgasmus decken. Ohne diese Zeile widerspräche das Strafbuch dem
   *  Live-Gate, dessen Regel es spiegeln soll (`isOpeningPermittedNow` über
   *  `getActiveOrgasmusAnforderung`): dort nicht erlaubt, hier verziehen.
   *  Geteilt von der Öffnungs-Ausnahme (`oeffnenErlaubt`) und der Frage, ob ein Orgasmus überhaupt
   *  gedeckt war — zwei Fragen, eine Fenster-Arithmetik. */
  const windowCovers = (w: { beginntAt: Date; endetAt: Date; withdrawnAt: Date | null; wirksamAb: Date | null }, at: Date): boolean =>
    at >= w.beginntAt && at <= w.endetAt
    && (w.withdrawnAt === null || w.withdrawnAt > at)
    && (w.wirksamAb === null || w.wirksamAb <= at);
  const oeffnenErlaubtWindows = orgasmusAnforderungen.filter((a) => a.oeffnenErlaubt);
  const isOrgasmusOpenAllowed = (openTime: Date): boolean =>
    oeffnenErlaubtWindows.some((w) => windowCovers(w, openTime));
  const resolveRule = offenseRuleResolver(offenseRuleChanges);

  // Wrong-device: StrafeRecord.refId points at the offending VERSCHLUSS entry (für Geräte-Namen laden).
  const wrongDeviceRecords = strafeRecordsRaw.filter((r) => r.offenseType === "FALSCHES_GERAET");
  const offenseEntryIds = wrongDeviceRecords.map((r) => r.refId);
  const offenseEntries = offenseEntryIds.length > 0
    ? await prisma.entry.findMany({
        where: { id: { in: offenseEntryIds } },
        // Drei Felder plus der Gerätename — genau das, was `wrongDeviceViolations` unten baut.
        select: { id: true, startTime: true, note: true, device: { select: { name: true } } },
      })
    : [];
  const offenseEntryById = new Map(offenseEntries.map((e) => [e.id, e]));
  const wrongDeviceViolations = wrongDeviceRecords.map((r) => {
    const entry = offenseEntryById.get(r.refId);
    return { entryId: r.refId, startTime: entry?.startTime ?? null, note: entry?.note ?? null, deviceName: entry?.device?.name ?? null };
  });

  const reinigungLimitViolations = cleaningLimitViolations(oeffnungen, cleaningAt, subTz, quotaEverSet);

  // Each OEFFNEN paired with the Sperrzeit active at its startTime (if any) — computed once,
  // shared by unauthorizedOpenings and cleaningNotRelocked below.
  const oeffnungenMitSperre = oeffnungen.map((o) => ({ o, sperre: findActiveSperrzeit(o.startTime, sperrzeiten) }));

  // Unauthorized openings — an OEFFNEN inside an active Sperrzeit. A REINIGUNG opening is
  // permitted when both the user flag and the Sperrzeit allow cleaning. System-authored openings
  // (source="system", the inspection-escalation auto-mark) are EXCLUDED: that's the sub's
  // presumed removal already counted once as `autoRemovedControls` — it's not a willful action by
  // the sub, so flagging it a second time here would double-punish a single ambiguous event.
  const unauthorizedOpenings = oeffnungenMitSperre
    .filter(({ o, sperre }) =>
      o.source !== "system" &&
      !!sperre && !isAllowedReinigungOpening(o, sperre, cleaningPermissionUserAt(cleaningAt(o.startTime), subTz), enforcedFrom) && !isOrgasmusOpenAllowed(o.startTime),
    )
    .map(({ o, sperre }) => ({
      id: o.id,
      startTime: o.startTime,
      note: o.note,
      sperrzeitEndetAt: sperre!.endetAt,
      sperrzeitIndefinite: sperre!.endetAt === null,
    }));

  // Die bereits beurteilten Vergehen — einmal gebaut, zweimal gebraucht: hier für die
  // Orgasmus-Ableitung und unten für `applyOffenseRules`.
  const judgedRefs = new Set(strafeRecordsRaw.map((r) => r.refId));

  // Orgasmus ohne deckende Direktive. Anders als alle übrigen Arten fragt diese die Regel schon
  // BEIM ABLEITEN, weil ihr Modus nicht nur ja/nein sagt, sondern die Reichweite bestimmt:
  // `lockedOnly` ahndet nur, was während einer laufenden Sperrzeit passierte, `always` jeden
  // ungedeckten Orgasmus. Der Modus wird zur TATZEIT gelesen, nicht jetzt — ein später umgelegter
  // Schalter schreibt die Vergangenheit nicht um (Begründung: `offenseRules.ts`).
  //
  // Gedeckt ist ein Orgasmus durch JEDES Fenster, das ihn umschliesst — Pflicht (ANWEISUNG) wie
  // Erlaubnis (GELEGENHEIT). Ob die Direktive dabei erfüllt wurde, ist eine andere Frage und hat mit
  // `missed_orgasm` ihr eigenes Vergehen; hier zählt allein, ob überhaupt eines offen stand.
  const unauthorizedOrgasms = orgasmusEintraege.flatMap((o) => {
    const mode = resolveRule("unauthorized_orgasm", o.startTime);
    // Ein bereits BEURTEILTES Vergehen überlebt jede Regeländerung — dieselbe Zusage, die
    // `applyOffenseRules` allen anderen schaltbaren Arten gibt. Sie muss hier stehen, weil diese Art
    // ihre Regel schon beim Ableiten liest und den Regel-Durchgang deshalb überspringt.
    //
    // Ohne sie liesse eine zurückdatierte `off`-Zeile das Vergehen aus der Ableitung fallen, während
    // sein Urteil bestehen bleibt: der Träger sähe „Vergehen unbekannt" ohne Art und ohne Tatzeit,
    // die Keyholderin ein Urteil ohne Anlass. Regel-Zeilen von Hand zurückzudatieren ist kein
    // theoretischer Fall — es ist der Weg, auf dem diese Regel rückwirkend scharf gestellt wird.
    //
    // Nur die REGEL wird überbrückt, nicht die Ableitung: deckt später eine Direktive den Orgasmus
    // ab, verschwindet er wie bei jeder anderen Art auch. Genau diese Grenze zieht `applyOffenseRules`
    // ebenfalls — sie filtert bereits abgeleitete Zeilen, nicht deren Anlass.
    const judged = judgedRefs.has(o.id);
    if (!judged && mode === "off") return [];
    if (orgasmusAnforderungen.some((w) => windowCovers(w, o.startTime))) return [];
    const sperre = findActiveSperrzeit(o.startTime, sperrzeiten);
    if (!judged && mode === "lockedOnly" && !sperre) return [];
    return [{
      id: o.id,
      startTime: o.startTime,
      orgasmusArt: o.orgasmusArt,
      note: o.note,
      sperrzeitEndetAt: sperre?.endetAt ?? null,
      sperrzeitIndefinite: sperre !== undefined && sperre.endetAt === null,
    }];
  });

  // Late locks — an ANFORDERUNG (lock request) whose deadline passed without a timely VERSCHLUSS.
  //
  // `!isHiddenFromSub`: eine Anforderung, die dem Sub nie zugestellt wurde, kann er nicht versäumt
  // haben. Erreichbar wird das über eine TERMINIERTE Anforderung mit ABSOLUTER Frist, die vor dem
  // Auslöse-Zeitpunkt liegt (nur `fristH` zählt ab `wirksamAb`): sie löst aus, wird nicht verschickt
  // — und hinterlässt eine Zeile, deren Frist schon abgelaufen ist. Ohne diesen Filter bekäme der
  // Sub dafür ein Vergehen, obwohl er von der Anforderung nie erfahren hat.
  const lateLocks = lockRequests
    .filter((a) => !isHiddenFromSub(a))
    .filter((a): a is typeof a & { endetAt: Date } => a.endetAt !== null)
    .filter((a) => isLateLock(a, now))
    .map((a) => ({ id: a.id, endetAt: a.endetAt, fulfilledAt: a.fulfilledAt, nachricht: a.nachricht }));

  // Cleaning not relocked — a REINIGUNG opening during an active, cleaning-permitted Sperrzeit
  // whose re-lock deadline passed without a timely VERSCHLUSS. No offense if the Sperrzeit itself
  // already ended before the deadline: once the Sperrzeit is over there's no further re-lock
  // obligation left to violate, whether or not (or how late) the user eventually re-locks.
  const cleaningNotRelocked = oeffnungenMitSperre
    .flatMap(({ o, sperre }) => {
      const settings = cleaningAt(o.startTime);
      const deadline = cleaningRelockObligation(o, sperre ?? null, cleaningPermissionUserAt(settings, subTz), settings.maxMinutes, enforcedFrom);
      if (!deadline) return [];
      const relockAt = verschluesse.find((v) => v.startTime > o.startTime)?.startTime ?? null;
      return isCleaningNotRelocked(deadline, relockAt, now)
        ? [{ entryId: o.id, startTime: o.startTime, deadline, relockAt, note: o.note }]
        : [];
    });

  const toControl = (k: typeof kontrollAnforderungen[number]): StrafbuchControlOffense => ({
    id: k.id,
    code: k.code,
    deadline: k.deadline,
    fulfilledAt: k.fulfilledAt ?? null,
    entryStartTime: k.entry?.startTime ?? null,
    backdated: !!(k.fulfilledAt && k.entry?.startTime &&
      k.entry.startTime.getTime() < k.deadline.getTime() &&
      k.fulfilledAt.getTime() > k.deadline.getTime()),
    kommentar: k.kommentar,
    entryNote: k.entry?.note ?? null,
  });

  // Wie toControl, aber liest den erzeugten Eintrag aus autoMarkedEntry statt entry (die
  // Kontrolle wurde nie erfüllt — das ist ja der Punkt — und `backdated` ist hier bedeutungslos).
  const toAutoRemovedControl = (k: typeof kontrollAnforderungen[number]): StrafbuchControlOffense => ({
    id: k.id,
    code: k.code,
    deadline: k.deadline,
    fulfilledAt: null,
    entryStartTime: k.autoMarkedEntry?.startTime ?? null,
    backdated: false,
    kommentar: k.kommentar,
    entryNote: k.autoMarkedEntry?.note ?? null,
  });

  const data: StrafbuchData = {
    unauthorizedOpenings,
    lateControls: kontrollAnforderungen
      .filter((k) => mapAnforderungStatus(k, k.entry?.startTime ?? null, now) === "late")
      .map(toControl),
    rejectedControls: kontrollAnforderungen
      .filter((k) => k.entry?.verifikationStatus === "rejected")
      .map(toControl),
    autoRemovedControls: kontrollAnforderungen
      .filter((k) => k.autoMarkedRemovedAt !== null)
      .map(toAutoRemovedControl),
    reinigungLimitViolations,
    wrongDeviceViolations,
    missedOrgasmInstructions: orgasmusAnforderungen
      // `!isHiddenFromSub`: eine terminierte Anweisung, die nie zugestellt wurde, ist kein Versäumnis
      // — der Träger hat von ihr nie erfahren. Der Poller zieht solche Zeilen zwar zurück, sobald ihr
      // Fenster durch ist; stand er (Neustart, Ausfall) über das Fensterende hinaus still, stünde hier
      // sonst genau die unverdiente Strafe, gegen die schon `checkOrgasmWindowEnd` gebaut ist.
      .filter((a) => a.art === "ANWEISUNG" && a.withdrawnAt === null && a.fulfilledAt === null && a.endetAt < now && !isHiddenFromSub(a))
      .sort((a, b) => b.endetAt.getTime() - a.endetAt.getTime())
      .map((a) => ({ id: a.id, endetAt: a.endetAt, nachricht: a.nachricht, requiredArt: a.vorgegebeneArt })),
    lateLocks,
    cleaningNotRelocked,
    unfulfilledTasks,
    adminPasswordChanges: adminPasswordChangesRaw.map((p) => ({
      id: p.id,
      at: p.createdAt,
      adminUsername: p.adminUsername,
      via: p.via,
      sperrzeitEndetAt: p.sperrzeitEndetAt,
    })),
    unauthorizedOrgasms,
    manualOffenses: manualOffensesRaw.map((m) => ({
      id: m.id,
      occurredAt: m.occurredAt,
      title: m.title,
      description: m.description,
      createdBy: m.createdBy,
    })),
    strafeRecords: strafeRecordsRaw.map((r) => ({
      refId: r.refId,
      offenseType: r.offenseType,
      status: r.status,
      bestraftDatum: r.bestraftDatum,
      notiz: r.notiz,
      reason: r.reason,
      judgedBy: r.judgedBy,
      erledigtAt: r.erledigtAt,
      taskId: r.taskId,
    })),
  };

  applyOffenseRules(data, resolveRule, judgedRefs, now);
  return data;
}
