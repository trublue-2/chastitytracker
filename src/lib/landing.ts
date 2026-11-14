import { prisma } from "@/lib/prisma";
import { getControlledSubs, canControlSub } from "@/lib/keyholder";
import { isController } from "@/lib/ownTracker";
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
 *   overview; a normal sub → own tracker. A brand-new instance (the admin is the only account and
 *   has no entry yet) starts on the own tracker — see `isFreshSoloInstance`.
 */
export async function resolveLandingPath(session: LandingSession): Promise<string> {
  const { id, role } = session.user;
  const isKeyholderOrAdmin = isController(session.user);

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
  if (subs.length === 1) return `/admin/users/${subs[0].id}`;
  if (role === "admin" && subs.length === 0 && !user?.hideOwnTracker && (await isFreshSoloInstance(id))) return "/dashboard";
  return "/admin";
}

/**
 * A brand-new instance: this account is the only one and has not recorded anything yet.
 *
 * Whoever sets up an instance gets exactly one account, the admin. The keyholder overview then lists
 * that admin as their own only "sub", with keyholder actions and no way to start — a tester had to
 * search for where the first lockup goes (feedback 2026-11-10). The own tracker greets with the
 * welcome block and its "Lock up" button instead. With the first entry or a second account the
 * usual landing applies again; nobody's habit changes.
 */
async function isFreshSoloInstance(userId: string): Promise<boolean> {
  const [otherAccounts, firstEntry] = await Promise.all([
    prisma.user.count({ where: { id: { not: userId } } }),
    prisma.entry.findFirst({ where: { userId }, select: { id: true } }),
  ]);
  return otherAccounts === 0 && !firstEntry;
}
