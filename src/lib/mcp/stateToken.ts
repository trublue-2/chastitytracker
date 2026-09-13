import { prisma } from "@/lib/prisma";
import { STATE_AREAS, type StateArea } from "./stateAreas";
import { buildEnvelope, makeIso, resolveUserContext, type Envelope } from "./common";

/**
 * `check_updates`: der billigste Aufruf des MCP. Sagt einer Sitzung, ob sich der Zustand des Subs
 * seit ihrem letzten Blick geändert hat und in welchen Bereichen — Grundlage und Pflege-Regeln in
 * `stateAreas.ts`.
 *
 * Das Token ist zustandslos: es trägt die Zähler aller Bereiche selbst, der Server merkt sich nichts
 * pro Sitzung. Deshalb funktioniert es über beliebig viele Chats und über Neustarts hinweg.
 *
 * **Nur diese Antwort trägt ein Token.** Es umfasst ALLE Bereiche; hinge es an einer anderen Antwort
 * (einem Read eines Bereichs, einem Write), deckte es Änderungen in den übrigen Bereichen ab, die die
 * Sitzung nie zu sehen bekam — sie übernähme das Token und übersähe sie. Hier dagegen steht neben dem
 * Token, was sich geändert hat. Eigene Writes erscheinen dadurch beim nächsten Aufruf als Änderung:
 * ein überflüssiges Nachlesen, aber nie ein verschluckter Zustand.
 */

/** Präfix = Format-Version. Ein anderes Präfix ist ein fremdes Token, kein geändertes. */
const TOKEN_PREFIX = "s1";

type Versions = Partial<Record<StateArea, { version: number; changedAt: Date }>>;

/** Zähler als Token: `s1.<zähler je Bereich in STATE_AREAS-Reihenfolge, base36>`. */
export function encodeStateToken(versions: Versions): string {
  return [TOKEN_PREFIX, ...STATE_AREAS.map((a) => (versions[a]?.version ?? 0).toString(36))].join(".");
}

/** Liest ein Token zurück. `null` bei allem, was dieser Server nicht ausgestellt haben kann. Ein
 *  KÜRZERES Token (vor einem später angehängten Bereich ausgestellt) ist gültig. */
export function decodeStateToken(token: string): number[] | null {
  const [prefix, ...parts] = token.trim().split(".");
  if (prefix !== TOKEN_PREFIX || parts.length === 0 || parts.length > STATE_AREAS.length) return null;
  if (!parts.every((p) => /^[0-9a-z]+$/.test(p))) return null;
  return parts.map((p) => parseInt(p, 36));
}

/** Bereiche, deren Zähler sich gegenüber dem Token unterscheidet. Eine Stelle, die das alte Token
 *  nicht kennt, zählt als geändert, sobald dort überhaupt etwas passiert ist. */
export function changedAreasSince(since: number[], versions: Versions): StateArea[] {
  return STATE_AREAS.filter((a, i) => (versions[a]?.version ?? 0) !== (since[i] ?? 0));
}

async function loadVersions(userId: string): Promise<Versions> {
  const rows = await prisma.stateVersion.findMany({
    where: { userId },
    select: { area: true, version: true, changedAt: true },
  });
  const out: Versions = {};
  for (const r of rows) {
    if ((STATE_AREAS as readonly string[]).includes(r.area)) {
      out[r.area as StateArea] = { version: r.version, changedAt: r.changedAt };
    }
  }
  return out;
}

export interface CheckUpdatesResult extends Envelope {
  schemaVersion: 1;
  user: string;
  /** Beim nächsten Aufruf als `since` mitgeben. */
  stateToken: string;
  /** `true`/`false` gegenüber `since`. `null`, wenn kein (gültiges) `since` kam — dann ist nichts
   *  vergleichbar, und alles Bekannte ist als ungeprüft zu behandeln. */
  changed: boolean | null;
  /** Nur bei `changed: true`: die geänderten Bereiche samt Zeitpunkt ihrer jüngsten Änderung. */
  changedAreas: { area: StateArea; lastChangeAt: string | null }[];
  /** Jüngste Änderung über alle Bereiche; `null`, wenn seit Einführung nie etwas geändert wurde. */
  lastChangeAt: string | null;
  /** Gesetzt, wenn `since` kein Token dieses Servers war. */
  sinceInvalid?: true;
}

export async function checkUpdates(username: string, since?: string): Promise<CheckUpdatesResult> {
  const { id: userId, timezone } = await resolveUserContext(username);
  const versions = await loadVersions(userId);
  const now = new Date();
  const iso = makeIso(timezone);

  const decoded = since ? decodeStateToken(since) : null;
  const changedAreas = decoded
    ? changedAreasSince(decoded, versions).map((area) => ({ area, lastChangeAt: iso(versions[area]?.changedAt) }))
    : [];
  const latest = Object.values(versions).reduce<Date | null>(
    (max, v) => (v && (!max || v.changedAt > max) ? v.changedAt : max), null,
  );

  return {
    schemaVersion: 1,
    user: username,
    ...buildEnvelope(now, iso, timezone),
    stateToken: encodeStateToken(versions),
    changed: decoded ? changedAreas.length > 0 : null,
    changedAreas,
    lastChangeAt: iso(latest),
    ...(since && !decoded ? { sinceInvalid: true as const } : {}),
  };
}
