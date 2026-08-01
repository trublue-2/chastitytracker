import type { EvaluatedTask, TaskProofView } from "@/lib/taskIntervals";
import { firstOutOfOrderProof, type TaskState } from "@/lib/tasks";
import { wearActionHref } from "@/lib/categoryConstants";

/**
 * Die serialisierbare Sicht auf eine ausgewertete Aufgabe — das, was `TaskCard` rendert.
 *
 * Eigene Schicht, weil die Auswertung mit `Date`-Objekten und Prisma-Zeilen arbeitet, die Karte aber
 * eine Client-Komponente ist: alles reist als ISO-String über die Grenze. Und beide Aufrufer
 * (Keyholder-Historie, Sub-Dashboard) sollen dieselbe Karte sehen — sonst driften zwei Darstellungen
 * desselben Zustands auseinander.
 */

export interface TaskCardRequirement {
  id: string;
  label: string;
  satisfied: boolean;
  /** Deep-Link ins passende Formular. null beim Keyholder (es sind nicht seine Formulare) und bei
   *  Bedingungen, deren Kategorie gelöscht wurde. */
  href: string | null;
}

/** Der Zustand EINES Nachweises, wie ihn die Karte zeigt. Bewusst feiner als das Gesamturteil der
 *  Aufgabe: der Sub muss sehen, welches Foto noch fehlt und welches beanstandet wurde. */
export type TaskCardProofState =
  /** Noch nicht eingereicht. */
  | "open"
  /** Erbracht — entweder maschinell über den Code bestätigt oder von der Keyholderin angenommen.
   *  Die beiden sind bewusst EIN Zustand: für den Sub bedeuten sie dasselbe („erledigt"), und wer
   *  geurteilt hat, steht in der Sichtungs-Anmerkung. Zwei Zustände, die überall gleich behandelt
   *  werden, sind einer zu viel. */
  | "confirmed"
  /** Eingereicht, wartet auf die Sichtung der Keyholderin (ohne Code-Pflicht, ohne Aufnahmezeit,
   *  oder Code nicht erkannt). */
  | "review"
  /** Von der Keyholderin abgelehnt. */
  | "rejected"
  /** Aufnahmezeit bricht die geforderte Reihenfolge — dieser Nachweis ist der Grund, warum die
   *  Aufgabe scheitert. Ohne diesen Zustand zeigte die Zeile „erbracht" (ihr Code stimmte ja),
   *  während die Aufgabe darunter „versäumt" meldet. */
  | "outOfOrder";

export interface TaskCardProof {
  id: string;
  /** Was zu sehen sein muss. */
  description: string;
  /** Der Code, den der Sub ins Bild schreiben muss. Null ohne Code-Pflicht.
   *  MUSS sichtbar sein — ohne ihn kann er den Nachweis gar nicht erbringen. */
  code: string | null;
  state: TaskCardProofState;
  /** Deep-Link ins Aufnahme-Formular. Null beim Keyholder und bei bereits eingereichten. */
  href: string | null;
  /** Das eingereichte Foto. Ohne es kann die Keyholderin nicht urteilen — und der Sub sieht, was er
   *  abgegeben hat. Null, solange nichts eingereicht ist. */
  imageUrl: string | null;
  /** Anmerkung der Keyholderin zur Sichtung. */
  reviewNote: string | null;
}

export interface TaskCardData {
  id: string;
  title: string;
  description: string | null;
  isPunishment: boolean;
  penaltyReason: string | null;
  /** ISO — die Karte formatiert in der Zeitzone des Betrachters. */
  holdUntil: string;
  state: TaskState;
  startedAt: string | null;
  /** Namen der jetzt fehlenden Bedingungen — „Fehlt noch: Knebel". */
  missing: string[];
  failedRequirement: string | null;
  failedAt: string | null;
  awaitingConfirmation: boolean;
  requirements: TaskCardRequirement[];
  /** Geforderte Nachweis-Fotos (Issue #39). Leer, wo keine gefordert sind. */
  proofs: TaskCardProof[];
  completionNote: string | null;
}

/** Der Zustand eines einzelnen Nachweises. Dieselbe Rangfolge wie in `evaluateProofs`: das Urteil
 *  eines MENSCHEN schlägt jede Automatik.
 *
 *  Exportiert, weil auch das MCP-Dashboard ihn ausliefert — der Keyholder-Agent sieht dann genau das,
 *  was die Karte zeigt. Zwei Ableitungen desselben Zustands wären zwei Antworten auf dieselbe Frage. */
export function taskProofState(p: TaskProofView, outOfOrderId: string | null): TaskCardProofState {
  // Die Reihenfolge schlägt alles: sie ist der Grund, aus dem die Aufgabe scheitert, und muss an der
  // Zeile stehen, die sie gebrochen hat.
  if (p.id === outOfOrderId) return "outOfOrder";
  if (p.reviewAccepted === true) return "confirmed";
  if (p.reviewAccepted === false) return "rejected";
  if (!p.submittedAt) return "open";
  return p.verifikationStatus !== null ? "confirmed" : "review";
}

/** Wohin führt eine offene Bedingung? KG in die Verschluss-Maske, alles andere ins Trage-Formular
 *  der Kategorie (mit dem geforderten Gerät, falls eines genannt ist).
 *
 *  Der Pfad kommt aus `wearActionHref` — dem einen Bauplatz dieser Route. Ihn hier nachzubauen
 *  hiesse, dass eine Routen-Änderung die Bedingungs-Links still ins Leere zeigen lässt: genau auf
 *  dem Weg, der den Sub vor einem Vergehen bewahren soll. */
function requirementHref(r: EvaluatedTask["requirements"][number], redirectTo: string | null): string | null {
  if (r.type === "KG_LOCKED") {
    const q = redirectTo ? `?${new URLSearchParams({ redirectTo })}` : "";
    return `/dashboard/new/verschluss${q}`;
  }
  if (!r.categoryId) return null; // Kategorie gelöscht — es gibt kein Formular mehr dafür.
  return wearActionHref({ categoryId: r.categoryId, active: false, deviceId: r.deviceId, redirectTo });
}

/**
 * @param withLinks Nur für den Sub: seine eigenen Formulare. Der Keyholder bekommt reine Anzeige.
 *
 * Die Links sind GEKETTET: der Link der ersten offenen Bedingung trägt als `redirectTo` den Link der
 * zweiten, dieser den der dritten. Damit wird aus drei Navigationen eine — fürs Leitbeispiel
 * (KG + Halsband + Knebel) der Unterschied zwischen „drei Mal zurück aufs Dashboard" und einem Durchlauf.
 */
export function toTaskCard(
  e: EvaluatedTask,
  withLinks: boolean,
  /** Anzeige-Felder der Nachweise (Beschreibung, Code) — separat geladen, siehe
   *  `loadTaskProofViews`. Fehlen sie, zeigt die Karte keine Nachweise: besser nichts als eine
   *  Zeile ohne den Code, den der Sub zeigen müsste. */
  proofViews: TaskProofView[] = [],
): TaskCardData {
  const requirements: TaskCardRequirement[] = e.requirements.map((r) => ({
    id: r.id,
    label: r.label,
    satisfied: r.satisfied,
    href: withLinks ? requirementHref(r, null) : null,
  }));

  // Von hinten nach vorne verketten: jeder offene Schritt kennt so den bereits fertig verketteten
  // Rest. Erfüllte Bedingungen sind keine Kettenglieder — sonst schickte die Kette den Sub in ein
  // Formular für ein Gerät, das er schon trägt.
  //
  // Neu gebaut statt angehängt: das Ziel gehört als Parameter in den Bauplatz der URL, nicht als
  // `?`/`&`-Rechnerei an eine fertige Zeichenkette.
  let next: string | null = null;
  for (let i = requirements.length - 1; i >= 0; i--) {
    const r = requirements[i];
    if (r.satisfied || !r.href) continue;
    if (next) r.href = withLinks ? requirementHref(e.requirements[i], next) : null;
    next = r.href;
  }

  // Nachweise sind KEINE Kettenglieder: jeder ist eine eigene Aufnahme zu einem eigenen Zeitpunkt,
  // und die Reihenfolge ist gerade die Forderung — sie hintereinander wegzuklicken wäre das
  // Gegenteil dessen, was verlangt ist.
  // Welcher Nachweis die Reihenfolge bricht, weiss nur die geteilte Regel aus `tasks.ts` — die
  // Anzeige darf sie nicht nachbauen, sonst zeigt sie irgendwann etwas anderes als das Urteil.
  const outOfOrderId = firstOutOfOrderProof(
    [...proofViews].sort((a, b) => a.sortOrder - b.sortOrder),
  )?.id ?? null;

  const proofs: TaskCardProof[] = proofViews.map((p) => {
    const state = taskProofState(p, outOfOrderId);
    return {
      id: p.id,
      description: p.description,
      code: p.code,
      state,
      href: withLinks && state === "open" ? `/dashboard/new/task-proof/${p.id}` : null,
      imageUrl: p.imageUrl,
      reviewNote: p.reviewNote,
    };
  });

  return {
    id: e.task.id,
    title: e.task.title,
    description: e.task.description,
    isPunishment: e.task.isPunishment,
    penaltyReason: e.task.penaltyReason,
    holdUntil: e.task.holdUntil.toISOString(),
    state: e.evaluation.state,
    startedAt: e.evaluation.startedAt?.toISOString() ?? null,
    missing: e.evaluation.missing.map((m) => m.label),
    failedRequirement: e.evaluation.failedRequirement?.label ?? null,
    failedAt: e.evaluation.failedAt?.toISOString() ?? null,
    awaitingConfirmation: e.evaluation.awaitingConfirmation,
    requirements,
    proofs,
    completionNote: e.task.completionNote,
  };
}
