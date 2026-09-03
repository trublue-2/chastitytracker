import { loadKontrolleRows, sortedKontrolleRows } from "@/lib/kontrollen";
import { buildEnvelope, makeIso, mcpDeviceCheckStatus, resolveUserContext, type Envelope, type McpDeviceCheckStatus } from "@/lib/mcp/common";
import { effectiveDeviceCheckStatus } from "@/lib/deviceCheck";
import { toVerifyFailure, type VerifyFailure } from "@/lib/verifyReason";
import type { AnforderungStatus } from "@/lib/utils";

/**
 * Der KONTROLL-VERLAUF für die KI-Keyholderin — die Liste, die sie in der Oberfläche unter
 * `/admin/users/<sub>/kontrollen` sieht.
 *
 * Bisher sah sie über den MCP nur Ausschnitte: die EINE offene Kontrolle im `keyholder_dashboard`
 * und die versäumten in `get_offenses`. Was dazwischen liegt — erfüllt, verspätet, zurückgezogen,
 * die Verifikation dazu — war nirgends abfragbar. Damit liess sich die häufigste Frage nach einer
 * Kontrolle („wie hat er zuletzt darauf reagiert?") nicht beantworten.
 *
 * DIESELBE ABLEITUNG wie die Oberfläche: `buildKontrolleRows` bestimmt Zustand, Ziel und
 * Verifikation. Eine eigene Status-Rechnung hier wäre eine zweite Wahrheit über denselben
 * Sachverhalt — und die Zustände sind nicht trivial (`missed` ist nicht `withdrawn`, `late` ist
 * nicht `fulfilled`).
 */

/** 1 — erste Fassung. */
export const INSPECTIONS_SCHEMA_VERSION = 1;

/** Wie viele Zeilen ohne ausdrücklichen Wunsch. Eine Kontroll-Historie wächst täglich; die Frage
 *  dahinter ist fast immer „die letzten paar", nicht „alle seit Anbeginn". */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

/** Wie weit zurück ohne ausdrücklichen Wunsch. Deckelt die ABFRAGE, nicht erst die Ausgabe: die
 *  ganze Historie zu laden, um zwanzig Zeilen zu zeigen, wäre bei laufenden Auto-Kontrollen nach
 *  einem Jahr vierstellig — bei jedem Zug der KI. */
const DEFAULT_DAYS = 90;
const MAX_DAYS = 3650;

const windowDays = (d: number | undefined) => Math.min(Math.max(d ?? DEFAULT_DAYS, 1), MAX_DAYS);

export interface ListInspectionsArgs {
  limit?: number;
  /** Wie weit zurück (Tage). Vorgabe {@link DEFAULT_DAYS}. */
  days?: number;
  /** Nur diese Zustände. Ohne Angabe: alle. */
  status?: InspectionStatus[];
}

/**
 * Die Zustände, die {@link buildKontrolleRows} vergibt.
 *
 * `selfcontrol` ist der Sonderfall ohne Anforderung: der Träger hat von sich aus eine Prüfung
 * eingereicht. In der Oberfläche steht dort `anforderungStatus: null` — für eine Maschine ist
 * `null` aber kein Zustand, sondern eine fehlende Angabe, deshalb bekommt er hier seinen Namen.
 */
export type InspectionStatus = AnforderungStatus | "selfcontrol";

export interface InspectionRow {
  /** Id der ANFORDERUNG — `null` bei einer freiwilligen Prüfung (es gibt keine). */
  id: string | null;
  /**
   * Id des EINTRAGS, mit dem eingereicht wurde — die Adresse, die `resolve_inspection` und
   * `get_image` verlangen. `null`, solange nichts eingereicht ist.
   *
   * Beide Ids stehen hier, weil sie verschiedene Dinge adressieren und die naheliegende Handlung an
   * der falschen scheitert: „unverified → ansehen, dann beurteilen" braucht DIESE, nicht die der
   * Anforderung.
   */
  entryId: string | null;
  status: InspectionStatus;
  /** Was kontrolliert werden sollte: Kategorie/Gerät, oder `null` für den Keuschheitsgürtel. */
  target: string | null;
  /** Anweisung der Keyholderin an dieser Kontrolle. */
  comment: string | null;
  requestedAt: string | null;
  /** Geplanter Auslöse-Zeitpunkt einer noch terminierten Kontrolle. */
  scheduledFor: string | null;
  deadline: string | null;
  /** Wann der Träger eingereicht hat. */
  fulfilledAt: string | null;
  withdrawnAt: string | null;
  /**
   * Der Stand der Foto-Prüfung: `ai`/`manual` = bestätigt, `rejected` = von einem Menschen
   * abgelehnt, `unverified` = geprüft und nicht erkannt, `pending`/`not_required` sonst.
   */
  verification: string | null;
  /**
   * WARUM die automatische Prüfung nicht gematcht hat — samt dem, was gelesen wurde.
   *
   * Über {@link toVerifyFailure} und nicht roh: der Grund gilt nur, solange nicht anderweitig
   * geurteilt wurde. Roh durchgereicht stünde neben einer von der Keyholderin BESTÄTIGTEN Kontrolle
   * weiterhin „Code falsch gelesen" — die KI zöge ein menschliches Urteil in Zweifel, das längst
   * gefallen ist. Die Admin-Liste hält dieselbe Schranke seit jeher.
   */
  verificationFailure: VerifyFailure | null;
  /** Geräte-Abgleich im Foto — über denselben Mapper wie `list_entries`/`timeline`, damit der Enum
   *  überall dasselbe heisst. Beratend, blockiert nichts. */
  deviceCheck: McpDeviceCheckStatus | null;
}

export interface ListInspectionsResult extends Envelope {
  schemaVersion: number;
  user: string;
  /** Das gelesene Zeitfenster in Tagen — `total` zählt NUR darin. Ohne diese Angabe läse sich eine
   *  kurze Liste als „mehr gab es nicht", statt als „mehr habe ich nicht gefragt". */
  windowDays: number;
  /** Wie viele Zeilen die Auswahl im Fenster hätte — damit ein abgeschnittener Blick erkennbar ist. */
  total: number;
  inspections: InspectionRow[];
}

/**
 * Der Verlauf, neueste zuerst.
 *
 * GEFILTERT wie die Keyholder-Sicht (`keyholderVisibleKontrolleWhere`): die zufälligen
 * Auto-Kontrollen bleiben verborgen, solange sie nicht ausgelöst haben — sonst verriete die Liste
 * der KI (und über sie dem Träger) den Zeitpunkt, dessen Unvorhersehbarkeit der ganze Zweck ist.
 */
export async function listInspections(username: string, args: ListInspectionsArgs = {}): Promise<ListInspectionsResult> {
  const now = new Date();
  const { id: userId, timezone } = await resolveUserContext(username);
  const iso = makeIso(timezone);

  // Über den geteilten Lader — dieselben zwei Abfragen und dieselbe Sortierung wie die beiden
  // Oberflächen. Mit Zeitfenster: hier wird bei JEDEM Zug der KI gelesen, und eine jahrealte
  // Auto-Kontrolle trägt zur Frage „wie hat er zuletzt reagiert?" nichts bei.
  const since = new Date(now.getTime() - windowDays(args.days) * 86_400_000);
  const rows = sortedKontrolleRows(await loadKontrolleRows(userId, now, since))
    .map((r): InspectionRow => ({
      id: r.kontrolleId,
      entryId: r.entryId,
      // `null` heisst „ohne Anforderung" — der Träger hat freiwillig eingereicht.
      status: (r.anforderungStatus ?? "selfcontrol") as InspectionStatus,
      target: r.target,
      comment: r.kommentar,
      requestedAt: iso(r.createdAt),
      scheduledFor: iso(r.scheduledFor),
      deadline: iso(r.deadline),
      fulfilledAt: iso(r.submittedAt ?? r.fulfilledAt),
      withdrawnAt: iso(r.withdrawnAt),
      verification: r.verifikationStatus,
      verificationFailure: toVerifyFailure(r.verifikationStatus, r.verifikationReason, r.verifikationReasonDetected),
      deviceCheck: r.deviceCheck ? mcpDeviceCheckStatus(effectiveDeviceCheckStatus(r.deviceCheck, r.deviceCheckNote)) : null,
    }));

  const filtered = args.status?.length ? rows.filter((r) => args.status!.includes(r.status)) : rows;
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  return {
    ...buildEnvelope(now, iso, timezone),
    schemaVersion: INSPECTIONS_SCHEMA_VERSION,
    user: username,
    windowDays: windowDays(args.days),
    total: filtered.length,
    inspections: filtered.slice(0, limit),
  };
}
