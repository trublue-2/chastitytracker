import { auth } from "@/lib/auth";
import Link from "next/link";
import AvatarMenu from "@/app/components/AvatarMenu";
import FeedbackButton from "@/app/components/FeedbackButton";
import HeaderMessages from "@/app/components/HeaderMessages";
import { headerActionsCls, headerBarCls, headerBrandCls, headerRowCls } from "@/app/components/inputStyles";
import { ownTrackerHidden } from "@/lib/ownTracker";
import pkg from "../../package.json";

export default async function Header() {
  const session = await auth();
  const user = session?.user;
  const feedbackEnabled = process.env.DISABLE_FEEDBACK !== "true";
  // Ohne eigenen Tracker gibt es keinen eigenen Posteingang — und `/dashboard/messages` wirft der
  // Proxy ohnehin nach /admin zurück. Der Test steht hier, weil diese Kopfzeile den Betroffenen
  // trotzdem erreicht: /dashboard/settings und /dashboard/changelog sind vom Rauswurf ausgenommen.
  const hideOwnTracker = await ownTrackerHidden(user);

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
          {/* Der grüne Bereich behält seinen eigenen Posteingang UND seine Bedingung: wer keinen
              eigenen Tracker hat, hat auch keinen eigenen Posteingang. Das App-Badge zählt hier
              trotzdem den Keyholder-Stand mit — die Regel dafür steht in `HeaderMessages`. */}
          {user?.id && !hideOwnTracker && <HeaderMessages actor={user} scope="own" />}
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
