import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import pkg from "@/../package.json";

export interface SettingsFormProps {
  username: string;
  email: string | null;
  timezone: string;
  startPage: string;
  /** Nur Keyholder/Admins (= haben das blaue Portal): steuert Startseiten-Wahl + Admin-Theme-Umschalter. */
  showStartPage: boolean;
  /** Globaler Admin — nur er sieht die eigene Karte in der Übersicht → nur ihm die Ausblenden-Option. */
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

  return {
    username,
    email,
    timezone,
    startPage,
    showStartPage,
    isAdmin,
    hideOwnTracker,
    version: pkg.version,
    buildDate: process.env.BUILD_DATE ?? undefined,
    feedbackEnabled: process.env.DISABLE_FEEDBACK !== "true",
  };
}
