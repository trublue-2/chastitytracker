import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import pkg from "@/../package.json";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;

  let username = session?.user?.name ?? "";
  let email: string | null = null;
  let mobileDesktopUpload = false;

  if (userId) {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, email: true, mobileDesktopUpload: true },
    });
    if (dbUser) {
      username = dbUser.username;
      email = dbUser.email ?? null;
      mobileDesktopUpload = dbUser.mobileDesktopUpload;
    }
  }

  const version = pkg.version;
  const buildDate = process.env.BUILD_DATE ?? undefined;

  return (
    <SettingsForm
      username={username}
      email={email}
      version={version}
      buildDate={buildDate}
      mobileDesktopUpload={mobileDesktopUpload}
    />
  );
}
