import type { CreateTaskSeriesParams } from "@/lib/taskService";

/** Die Serien-Vorlage aus dem rohen Request-Body — Felder EINZELN übernommen (nie den Body spreaden),
 *  wie bei `POST /api/admin/tasks`. Geteilt von Anlege- und Änderungs-Route, damit beide dieselbe
 *  Form durchreichen. `userId` kommt vom Aufrufer (die Route hat ihn schon geprüft), nicht aus dem
 *  Body. */
export function taskSeriesParamsFromBody(userId: string, body: Record<string, unknown>): CreateTaskSeriesParams {
  const r = (body.recurrence ?? {}) as Record<string, unknown>;
  return {
    userId,
    title: String(body.title ?? ""),
    description: body.description as string | null | undefined,
    holdDurationMin: body.holdDurationMin as number | null | undefined,
    holdWindowMin: body.holdWindowMin as number | null | undefined,
    startGraceMin: body.startGraceMin as number | undefined,
    proofOrderMatters: body.proofOrderMatters as boolean | undefined,
    requirements: body.requirements as CreateTaskSeriesParams["requirements"],
    proofs: body.proofs as CreateTaskSeriesParams["proofs"],
    recurrence: {
      freq: r.freq as CreateTaskSeriesParams["recurrence"]["freq"],
      interval: r.interval as number | undefined,
      weekdayMask: r.weekdayMask as number | null | undefined,
      ordinal: r.ordinal as number | null | undefined,
      timeOfDay: String(r.timeOfDay ?? ""),
      startsOn: r.startsOn as string,
      until: r.until as string | null | undefined,
      exclusionDates: r.exclusionDates as string[] | null | undefined,
    },
  };
}
