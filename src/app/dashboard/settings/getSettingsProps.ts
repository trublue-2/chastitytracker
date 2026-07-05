import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getControllableSubs } from "@/lib/keyholder";
import { isValidStartPage } from "@/lib/constants";
import pkg from "@/../package.json";

export interface SettingsFormProps {
  username: string;
  email: string | null;
  timezone: string;
  startPage: string;
  /** Nur Keyholder/Admins (= haben das blaue Portal): steuert Startseiten-Wahl + Admin-Theme-Umschalter. */
  showStartPage: boolean;
  /** Subs, die als konkrete Startseite (Detailseite) wählbar sind — leer für normale Subs. */
  controlledSubs: { id: string; username: string }[];
  /** Globaler Admin — steuert die "Benutzerverwaltung"-Startseiten-Option (admin-only Seite). */
  isAdmin: boolean;
  hideOwnTracker: boolean;
  version: string;
  buildDate?: string;
  feedbackEnabled?: boolean;
}

/**
 * Lädt die persönlichen Einstellungen des eingeloggten Users für das SettingsForm — single source,
 * damit die grüne (/dashboard/settings) und die blaue (/admin/settings) Ansicht IDENTISCH sind.
 * Die Startseiten-Wahl ist nur für Keyholder/Admins relevant (nur sie haben eine Übersicht).
 */
export async function getSettingsProps(): Promise<SettingsFormProps> {
  const session = await auth();
  const userId = session?.user?.id;

  let username = session?.user?.name ?? "";
  let email: string | null = null;
  let timezone = "Europe/Zurich";
  let startPage = "auto";
  let hideOwnTracker = false;

  if (userId) {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, email: true, timezone: true, startPage: true, hideOwnTracker: true },
    });
    if (dbUser) {
      username = dbUser.username;
      email = dbUser.email ?? null;
      timezone = dbUser.timezone;
      startPage = dbUser.startPage;
      hideOwnTracker = dbUser.hideOwnTracker;
    }
  }

  const isAdmin = session?.user?.role === "admin";
  const showStartPage =
    isAdmin || !!(session?.user as { controlsSubs?: boolean } | undefined)?.controlsSubs;
  // Nur wenn die Startseiten-Wahl sichtbar ist: die als Startseite wählbaren Subs laden.
  const controlledSubs =
    showStartPage && userId ? await getControllableSubs(userId, session?.user?.role) : [];
  // Eine gespeicherte Sub-ID, die nicht (mehr) wählbar ist (Sub entfernt/entzogen), würde im Select als
  // leerer Wert erscheinen → für die Anzeige auf "auto" zurückfallen (Landing tut das zur Laufzeit ohnehin).
  const startPageDisplay =
    isValidStartPage(startPage) || controlledSubs.some((s) => s.id === startPage) ? startPage : "auto";

  return {
    username,
    email,
    timezone,
    startPage: startPageDisplay,
    showStartPage,
    controlledSubs,
    isAdmin,
    hideOwnTracker,
    version: pkg.version,
    buildDate: process.env.BUILD_DATE ?? undefined,
    feedbackEnabled: process.env.DISABLE_FEEDBACK !== "true",
  };
}
