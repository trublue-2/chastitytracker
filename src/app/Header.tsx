import { auth } from "@/lib/auth";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import AvatarMenu from "@/app/components/AvatarMenu";
import FeedbackButton from "@/app/components/FeedbackButton";
import { controlsAnySub } from "@/lib/keyholder";
import pkg from "../../package.json";

export default async function Header() {
  const session = await auth();
  const user = session?.user;
  const feedbackEnabled = process.env.DISABLE_FEEDBACK !== "true";
  const [controlsSubs, t] = await Promise.all([
    user?.id ? controlsAnySub(user.id) : Promise.resolve(false),
    getTranslations("keyholder"),
  ]);

  const hostname = process.env.NEXTAUTH_URL
    ? (() => { try { return new URL(process.env.NEXTAUTH_URL!).hostname; } catch { return null; } })()
    : null;

  return (
    <header className="bg-header-bg border-b border-header-border sticky top-0 z-30 pt-safe">
      <div className="px-4 h-14 flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="font-bold text-header-text hover:opacity-80 transition text-lg tracking-tight flex items-baseline gap-2"
        >
          KG-Tracker
          {hostname && (
            <span className="text-xs font-normal text-header-text/60 tracking-normal">
              {hostname}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2">
          {user && controlsSubs && (
            <Link
              href="/admin"
              aria-label={t("title")}
              className="w-8 h-8 rounded-full flex items-center justify-center text-header-text/80 hover:bg-header-text/10 transition"
            >
              <KeyRound size={18} strokeWidth={1.75} />
            </Link>
          )}
          {user && feedbackEnabled && <FeedbackButton />}
          {user && (
            <AvatarMenu
              username={user.name ?? ""}
              settingsHref="/dashboard/settings"
              theme="user"
              version={pkg.version}
            />
          )}
        </div>
      </div>
    </header>
  );
}
