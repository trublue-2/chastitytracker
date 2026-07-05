import { prisma } from "@/lib/prisma";
import { getControlledSubs } from "@/lib/keyholder";
import type { StartPage } from "@/lib/constants";

/** Session shape the landing resolver needs (subset of the NextAuth session). */
interface LandingSession {
  user: { id: string; role?: string; controlsSubs?: boolean };
}

/**
 * Post-login / root landing path based on the user's `startPage` preference, role and controlled subs.
 * - "dashboard" → own tracker (always allowed).
 * - "overview"  → keyholder overview (falls back to own tracker for non-keyholders).
 * - "auto" (default) → keyholder/admin: exactly one controlled sub → straight into it, else the
 *   overview; a normal sub → own tracker.
 */
export async function resolveLandingPath(session: LandingSession): Promise<string> {
  const { id, role, controlsSubs } = session.user;
  const isKeyholderOrAdmin = role === "admin" || !!controlsSubs;

  const user = await prisma.user.findUnique({ where: { id }, select: { startPage: true } });
  const pref = (user?.startPage ?? "auto") as StartPage;

  if (pref === "dashboard") return "/dashboard";
  // "overview"/"auto" only mean something for keyholders/admins; everyone else lands on their tracker.
  if (!isKeyholderOrAdmin) return "/dashboard";
  if (pref === "overview") return "/admin";

  // auto: adaptiv — genau ein gesteuerter Sub → direkt in diesen, sonst die Übersicht.
  // Globale Admins steuern alle User über die Rolle (keine AdminUserRelationship-Zeilen), darum
  // zählen für sie alle Nicht-Admin-User (= die Subs). Keyholder: nur ihre zugewiesenen Subs.
  const subs = role === "admin"
    ? await prisma.user.findMany({ where: { role: { not: "admin" } }, select: { id: true }, take: 2 })
    : await getControlledSubs(id);
  return subs.length === 1 ? `/admin/users/${subs[0].id}` : "/admin";
}
