import { prisma } from "@/lib/prisma";
import type { ServiceResult } from "@/lib/serviceResult";

export interface SetReinigungParams {
  /** Allow cleaning pauses (short opening without an entry). */
  erlaubt?: boolean;
  /** Max minutes per cleaning pause. */
  maxMinuten?: number;
  /** Max cleaning pauses per day (0 = unlimited). */
  maxProTag?: number;
}

/** Max minutes per cleaning pause is clamped to this range. */
const MAX_MINUTEN_RANGE = { min: 1, max: 120, fallback: 15 } as const;
/** Max cleaning pauses per day is clamped to this range (0 = unlimited). */
const MAX_PRO_TAG_RANGE = { min: 0, max: 20, fallback: 0 } as const;

function clamp(value: number, { min, max, fallback }: { min: number; max: number; fallback: number }): number {
  return Math.max(min, Math.min(max, Math.round(value) || fallback));
}

/**
 * Updates a user's cleaning-pause (Reinigung) settings. Only provided fields change; numeric
 * fields are clamped to their valid ranges. Shared by PATCH /api/admin/users/[id] and the MCP tool.
 */
export async function setReinigungSettings(userId: string, params: SetReinigungParams): Promise<ServiceResult<null>> {
  const data: { reinigungErlaubt?: boolean; reinigungMaxMinuten?: number; reinigungMaxProTag?: number } = {};

  if (params.erlaubt !== undefined) data.reinigungErlaubt = params.erlaubt;
  if (params.maxMinuten !== undefined) data.reinigungMaxMinuten = clamp(params.maxMinuten, MAX_MINUTEN_RANGE);
  if (params.maxProTag !== undefined) data.reinigungMaxProTag = clamp(params.maxProTag, MAX_PRO_TAG_RANGE);

  if (Object.keys(data).length === 0) return { ok: false, status: 400, error: "Keine Felder zum Aktualisieren" };

  await prisma.user.update({ where: { id: userId }, data });
  return { ok: true, data: null };
}
