import { prisma } from "@/lib/prisma";
import { getControlledSubs, canControlSub } from "@/lib/keyholder";
import { isValidStartPage } from "@/lib/constants";

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

  const user = await prisma.user.findUnique({
    where: { id },
    select: { startPage: true, hideOwnTracker: true },
  });
  // startPage ist entweder ein fester Wert (auto/overview/users/dashboard) ODER eine Sub-ID
  // (direkt auf dessen Detailseite landen).
  const pref = user?.startPage ?? "auto";

  // "Kein eigener Tracker": nie im grünen Bereich landen (auch nicht bei pref="dashboard").
  if (pref === "dashboard" && !user?.hideOwnTracker) return "/dashboard";
  // "overview"/"users"/"auto"/Sub-ID gelten nur für Keyholder/Admins; alle anderen landen auf ihrem Tracker.
  if (!isKeyholderOrAdmin) return "/dashboard";
  if (pref === "overview") return "/admin";
  if (pref === "users") return role === "admin" ? "/admin/users" : "/admin";
  if (pref !== "auto") {
    // Ein fester Wert, der oben nicht behandelt wurde (z.B. künftig neuer StartPage-Wert, oder
    // "dashboard" bei aktivem hideOwnTracker) → sichere Übersicht statt als Sub-ID zu deuten.
    if (isValidStartPage(pref)) return "/admin";
    // Sonst: konkrete Sub-ID → dessen Detailseite, wenn der Actor ihn (noch) kontrolliert; sonst Übersicht.
    return (await canControlSub(id, role, pref)) ? `/admin/users/${pref}` : "/admin";
  }

  // auto: adaptiv — genau ein gesteuerter Sub → direkt in diesen, sonst die Übersicht.
  // Globale Admins steuern alle User über die Rolle (keine AdminUserRelationship-Zeilen), darum
  // zählen für sie alle Nicht-Admin-User (= die Subs). Keyholder: nur ihre zugewiesenen Subs.
  const subs = role === "admin"
    ? await prisma.user.findMany({ where: { role: { not: "admin" } }, select: { id: true }, take: 2 })
    : await getControlledSubs(id);
  return subs.length === 1 ? `/admin/users/${subs[0].id}` : "/admin";
}
