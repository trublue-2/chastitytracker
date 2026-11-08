import { auth } from "@/lib/auth/auth";
import Link from "next/link";
import AvatarMenu from "@/app/components/AvatarMenu";
import FeedbackButton from "@/app/components/FeedbackButton";
import HeaderMessages from "@/app/components/HeaderMessages";
import JournalHeaderLink from "@/app/components/JournalHeaderLink";
import SkipLink from "@/app/components/SkipLink";
import { headerActionsCls, headerBarCls, headerBrandCls, headerHostCls, headerNameCls, headerRowCls } from "@/app/components/inputStyles";
import { ownTrackerHidden } from "@/lib/auth/ownTracker";
import pkg from "../../package.json";
import { instanceHostname } from "@/lib/upstream/appMeta";
import { APP_NAME } from "@/lib/constants";
import { feedbackSetup } from "@/lib/upstream/feedbackSetup";

export default async function Header() {
  const session = await auth();
  const user = session?.user;
  // Ohne eigenen Tracker gibt es keinen eigenen Posteingang — und `/dashboard/messages` wirft der
  // Proxy ohnehin nach /admin zurück. Der Test steht hier, weil diese Kopfzeile den Betroffenen
  // trotzdem erreicht: /dashboard/settings und /dashboard/changelog sind vom Rauswurf ausgenommen.
  const hideOwnTracker = await ownTrackerHidden(user);

  const hostname = instanceHostname();

  return (
    <header className={headerBarCls}>
      {/* Als ERSTES fokussierbares Element der Seite — steht er weiter unten, hat der Tab-Weg die
          Navigation schon durchlaufen, die er abkürzen soll. */}
      <SkipLink />
      <div className={headerRowCls}>
        <Link href="/dashboard" className={headerBrandCls}>
          <span className={headerNameCls}>{APP_NAME}</span>
          {hostname && <span className={headerHostCls}>{hostname}</span>}
        </Link>

        <div className={headerActionsCls}>
          {/* Der grüne Bereich behält seinen eigenen Posteingang UND seine Bedingung: wer keinen
              eigenen Tracker hat, hat auch keinen eigenen Posteingang. Das App-Badge zählt hier
              trotzdem den Keyholder-Stand mit — die Regel dafür steht in `HeaderMessages`. */}
          {user?.id && !hideOwnTracker && <HeaderMessages actor={user} scope="own" />}
          {/* Unter 360 px weicht das Feedback dem Tagebuch-Zeichen: mit vier Symbolen schob sich sonst
              der App-Name unter die Glocke. Erreichbar bleibt es als Zeile in den Einstellungen. */}
          {user && <span className="hidden min-[360px]:contents"><FeedbackButton feedback={await feedbackSetup()} /></span>}
          {/* Das Tagebuch gehört dem eigenen Tracker — dieselbe Bedingung wie der eigene Posteingang.
              Am persönlichen Ende der Zeile, vor dem Avatar, nicht direkt neben der Glocke: dort
              läse es sich wie ein Kanal zur Keyholderin. */}
          {user?.id && !hideOwnTracker && <JournalHeaderLink />}
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
