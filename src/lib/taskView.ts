import type { EvaluatedTask } from "@/lib/taskIntervals";
import type { TaskState } from "@/lib/tasks";

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
  completionNote: string | null;
}

/** Wohin führt eine offene Bedingung? KG in die Verschluss-Maske, alles andere ins Trage-Formular
 *  der Kategorie (mit dem geforderten Gerät, falls eines genannt ist). */
function requirementHref(r: EvaluatedTask["requirements"][number]): string | null {
  if (r.type === "KG_LOCKED") return "/dashboard/new/verschluss";
  if (!r.categoryId) return null; // Kategorie gelöscht — es gibt kein Formular mehr dafür.
  const device = r.deviceId ? `&device=${r.deviceId}` : "";
  return `/dashboard/new/wear-begin?category=${r.categoryId}${device}`;
}

/**
 * @param withLinks Nur für den Sub: seine eigenen Formulare. Der Keyholder bekommt reine Anzeige.
 *
 * Die Links sind GEKETTET: der Link der ersten offenen Bedingung trägt als `redirectTo` den Link der
 * zweiten, dieser den der dritten. Damit wird aus drei Navigationen eine — fürs Leitbeispiel
 * (KG + Halsband + Knebel) der Unterschied zwischen „drei Mal zurück aufs Dashboard" und einem Durchlauf.
 */
export function toTaskCard(e: EvaluatedTask, withLinks: boolean): TaskCardData {
  const requirements: TaskCardRequirement[] = e.requirements.map((r) => ({
    id: r.id,
    label: r.label,
    satisfied: r.satisfied,
    href: withLinks ? requirementHref(r) : null,
  }));

  // Von hinten nach vorne verketten: jeder offene Schritt kennt so den bereits fertig verketteten
  // Rest. Erfüllte Bedingungen sind keine Kettenglieder — sonst schickte die Kette den Sub in ein
  // Formular für ein Gerät, das er schon trägt.
  let next: string | null = null;
  for (let i = requirements.length - 1; i >= 0; i--) {
    const r = requirements[i];
    if (r.satisfied || !r.href) continue;
    if (next) r.href = `${r.href}${r.href.includes("?") ? "&" : "?"}redirectTo=${encodeURIComponent(next)}`;
    next = r.href;
  }

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
    completionNote: e.task.completionNote,
  };
}
