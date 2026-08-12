import { auth } from "@/lib/auth";
import Link from "next/link";
import AvatarMenu from "@/app/components/AvatarMenu";
import FeedbackButton from "@/app/components/FeedbackButton";
import HeaderMessages from "@/app/components/HeaderMessages";
import { headerActionsCls, headerBarCls, headerBrandCls, headerRowCls } from "@/app/components/inputStyles";
import pkg from "../../package.json";

export default async function Header() {
  const session = await auth();
  const user = session?.user;
  const feedbackEnabled = process.env.DISABLE_FEEDBACK !== "true";

  const hostname = process.env.NEXTAUTH_URL
    ? (() => { try { return new URL(process.env.NEXTAUTH_URL!).hostname; } catch { return null; } })()
    : null;

  return (
    <header className={headerBarCls}>
      <div className={headerRowCls}>
        <Link href="/dashboard" className={headerBrandCls}>
          KG-Tracker
          {hostname && (
            <span className="text-xs font-normal text-header-text/60 tracking-normal">
              {hostname}
            </span>
          )}
        </Link>

        <div className={headerActionsCls}>
          {user?.id && <HeaderMessages userId={user.id} />}
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
