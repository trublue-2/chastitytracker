import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import pkg from "@/../package.json";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;

  let username = session?.user?.name ?? "";
  let email: string | null = null;
  let timezone = "Europe/Zurich";
  let startPage = "auto";

  if (userId) {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, email: true, timezone: true, startPage: true },
    });
    if (dbUser) {
      username = dbUser.username;
      email = dbUser.email ?? null;
      timezone = dbUser.timezone;
      startPage = dbUser.startPage;
    }
  }

  // Die Startseiten-Wahl ist nur für Keyholder/Admins relevant (nur sie haben eine Übersicht) —
  // für normale Subs ist „auto" ohnehin gleich „eigener Tracker", darum blenden wir sie dort aus.
  const showStartPage =
    session?.user?.role === "admin" ||
    !!(session?.user as { controlsSubs?: boolean } | undefined)?.controlsSubs;

  const version = pkg.version;
  const buildDate = process.env.BUILD_DATE ?? undefined;
  const feedbackEnabled = process.env.DISABLE_FEEDBACK !== "true";

  return (
    <SettingsForm
      username={username}
      email={email}
      timezone={timezone}
      startPage={startPage}
      showStartPage={showStartPage}
      version={version}
      buildDate={buildDate}
      feedbackEnabled={feedbackEnabled}
    />
  );
}
