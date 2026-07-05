import Link from "next/link";
import { getTranslations } from "next-intl/server";
import AvatarMenu from "@/app/components/AvatarMenu";
import FeedbackButton from "@/app/components/FeedbackButton";
import pkg from "../../package.json";

interface Props {
  username: string;
  isGlobalAdmin: boolean;
}

export default async function AdminHeader({ username, isGlobalAdmin }: Props) {
  const feedbackEnabled = process.env.DISABLE_FEEDBACK !== "true";
  const t = await getTranslations("adminNav");
  // Ein reiner Keyholder (role=user, kontrolliert Subs) landet im selben blauen Bereich wie ein Admin —
  // der Titel benennt aber die tatsächliche Rolle, damit „Adminportal" niemanden fälschlich zum Admin macht.
  const portalTitle = isGlobalAdmin ? t("portalAdmin") : t("portalKeyholder");

  return (
    <header className="bg-header-bg border-b border-header-border sticky top-0 z-30 pt-safe">
      <div className="px-4 h-14 flex items-center justify-between gap-3">
        <Link
          href="/admin"
          className="font-bold text-header-text hover:opacity-80 transition text-lg tracking-tight flex items-baseline gap-2"
        >
          {portalTitle}
        </Link>

        <div className="flex items-center gap-2">
          {feedbackEnabled && <FeedbackButton />}
          <AvatarMenu
            username={username}
            settingsHref="/admin/settings"
            theme="admin"
            version={pkg.version}
            isGlobalAdmin={isGlobalAdmin}
          />
        </div>
      </div>
    </header>
  );
}
