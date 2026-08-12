import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { getControllableSubsCached, isKeyholderOf } from "@/lib/keyholder";
import { errorResponse } from "@/lib/serviceResult";

/** A session that is guaranteed to carry a user id (what `requireApi` hands back).
 *  `Session` (not `ReturnType<typeof auth>`) — `auth` is overloaded and would resolve to the
 *  middleware signature. Die `user.id`/`user.role`-Felder kommen aus src/types/next-auth.d.ts. */
export type ApiSession = Session;

/**
 * Plain-user API guard — the counterpart to `requireAdminApi()` for routes that only need "somebody
 * is logged in". Returns the session on success, so the caller needs no second `auth()` call:
 *
 *   const session = await requireApi();
 *   if (session instanceof NextResponse) return session;
 *   // session is narrowed to ApiSession here
 *
 * Deliberately NOT used by `oauth/authorize` (returns the RFC-6749 lowercase `unauthorized` code
 * its clients string-match) nor by `uploads/[...path]` (answers in plaintext, not JSON).
 */
export async function requireApi(): Promise<ApiSession | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return session;
}

/** Returns a 403 NextResponse if the current session is not an admin, otherwise null. */
export async function requireAdminApi(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Redirects to /login if the current session is not an admin. For use in page components. */
export async function assertAdmin(): Promise<void> {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");
}

/** API guard wie {@link requireKeyholderOrAdminApi}, gibt bei Erfolg aber die SESSION zurück — für
 *  Routen, die den Handelnden brauchen (z.B. um ihn aus einer Empfängerliste zu streichen), ohne
 *  ein zweites `auth()`. Gleiche Form wie {@link requireApi}, also auch dieselbe Prüfung beim
 *  Aufrufer (`instanceof NextResponse`).
 *
 *  Bewusst eine eigene Funktion statt eines erweiterten Rückgabetyps der bestehenden: deren ~20
 *  Aufrufer prüfen `if (err) return err`, und ein wahrheitswertiges Erfolgs-Objekt würde dort als
 *  Antwort zurückgegeben — ein stiller 200 mit dem Guard-Ergebnis als Body. */
export async function requireKeyholderOrAdminActor(targetUserId: string): Promise<ApiSession | NextResponse> {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (session.user.role === "admin") return session;
  if (await isKeyholderOf(session.user.id, targetUserId)) return session;
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** API guard: allows a global admin OR a keyholder of `targetUserId`. Self-control is impossible
 *  (isKeyholderOf rejects actor === target). Returns a 401/403 NextResponse on denial, else null. */
export async function requireKeyholderOrAdminApi(targetUserId: string): Promise<NextResponse | null> {
  const actor = await requireKeyholderOrAdminActor(targetUserId);
  return actor instanceof NextResponse ? actor : null;
}

/** Der Handelnde UND die Träger, die er kontrollieren darf — die Rechte-Grenze als DATUM, nicht als
 *  blosses Ja/Nein. Genau in dieser Form braucht sie der Service (`keyholderInbox(readerId, subs)`,
 *  siehe messageService.ts): mit den Namen, weil die Zeilen des Keyholder-Posteingangs sie tragen
 *  und die Abfrage sie ohnehin mitliest. */
export interface ControllerScope {
  session: ApiSession;
  /** Die Subs des Handelnden, alphabetisch (siehe `getControllableSubs`). Beim globalen Admin alle
   *  Nicht-Admin-Nutzer — leer nur auf einer Ein-Personen-Instanz. */
  subs: { id: string; username: string }[];
}

/** Warum ein Zugriff nicht durchgeht — die Antwort ohne die Form, in der sie ausgeliefert wird.
 *  „Nicht angemeldet" und „darf nicht" sind verschiedene Dinge und werden je nach Aufrufer als
 *  401/403 oder als zwei verschiedene Umleitungen beantwortet. */
type ControllerDenial = "unauthenticated" | "forbidden";

/**
 * DIE Regel der Keyholder-Sicht OHNE einzelnen Träger, einmal formuliert: wer angemeldet ist und
 * mindestens einen Träger kontrolliert (oder qua Admin-Rolle Kontrolleur ist), bekommt seine
 * Träger-Liste; alle anderen eine Absage.
 *
 * Ein Sub OHNE Subs bekommt „darf nicht", keine leere Liste: „hat nichts" wäre die falsche Antwort
 * — sie sähe heute gleich aus und ginge morgen auf, sobald ihm jemand einen Träger zuordnet. Der
 * globale Admin bleibt Kontrolleur, auch wenn seine Liste leer ist (Ein-Personen-Instanz): er ist
 * es qua Rolle, nicht qua Zuordnung.
 *
 * Die Liste kommt aus `getControllableSubsCached` — in BEIDEN Guards dieselbe Abfrage, pro Request
 * memoisiert: Seiten-Guard, Kopfzeilen-Zähler und die Seite selbst teilen sich damit einen einzigen
 * Zugriff. Sie ZWEIMAL zu ermitteln wäre die zweite Ableitung derselben Zuordnung — genau die, vor
 * der `keyholderInbox()` warnt.
 */
async function resolveControllerScope(): Promise<ControllerScope | ControllerDenial> {
  const session = await auth();
  if (!session?.user?.id) return "unauthenticated";
  const subs = await getControllableSubsCached(session.user.id, session.user.role);
  if (session.user.role !== "admin" && subs.length === 0) return "forbidden";
  return { session, subs };
}

/**
 * API-Guard der Keyholder-Sicht OHNE einzelnen Träger — für Routen, die über ALLE Subs des
 * Handelnden gehen (sein Posteingang). {@link requireKeyholderOrAdminApi} greift dort nicht: dessen
 * `targetUserId` gibt es nicht, die Sammel-Sicht hat kein einzelnes Ziel.
 *
 * Gleiche Form wie {@link requireApi}: der Aufrufer prüft `instanceof NextResponse`.
 */
export async function requireControllerApi(): Promise<ControllerScope | NextResponse> {
  const scope = await resolveControllerScope();
  if (scope === "unauthenticated") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (scope === "forbidden") return errorResponse(403, "FORBIDDEN");
  return scope;
}

/**
 * Seiten-Guard der Keyholder-Sicht — die Entsprechung zu {@link requireControllerApi} für eine
 * SEITE: dieselbe Regel ({@link resolveControllerScope}), aber Umleitung statt Statuscode (wie
 * {@link assertKeyholderOrAdmin} neben `requireKeyholderOrAdminApi`).
 *
 * `proxy.ts` lässt Nicht-Admins nur auf ausgewählte `/admin`-Pfade; dieser Guard ist die zweite,
 * inhaltliche Schranke — er entscheidet über die Rolle, nicht über den Pfad.
 */
export async function assertController(): Promise<ControllerScope> {
  const scope = await resolveControllerScope();
  if (scope === "unauthenticated") redirect("/login");
  if (scope === "forbidden") redirect("/dashboard");
  return scope;
}

/** Page guard: returns the actor's id + whether they are a global admin if they are admin or
 *  keyholder of `targetUserId`, else redirects. Returning isGlobalAdmin lets callers gate
 *  admin-only UI without a second `auth()` call. */
export async function assertKeyholderOrAdmin(targetUserId: string): Promise<{ userId: string; isGlobalAdmin: boolean }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const isGlobalAdmin = session.user.role === "admin";
  if (isGlobalAdmin || (await isKeyholderOf(session.user.id, targetUserId))) {
    return { userId: session.user.id, isGlobalAdmin };
  }
  redirect("/dashboard");
}

/** Returns a 404 NextResponse if the device-categories feature flag is off, else null.
 *  Mirrors `requireAdminApi()` — caller does:
 *  `const gate = deviceCategoriesGate(); if (gate) return gate;`. */
export function deviceCategoriesGate(): NextResponse | null {
  if (deviceCategoriesEnabled()) return null;
  return NextResponse.json({ error: "Device-Kategorien sind nicht aktiviert" }, { status: 404 });
}
