import Link from "next/link";
import { getTranslations } from "next-intl/server";
import AvatarMenu from "@/app/components/AvatarMenu";
import FeedbackButton from "@/app/components/FeedbackButton";
import HeaderMessages from "@/app/components/HeaderMessages";
import { headerActionsCls, headerBarCls, headerBrandCls, headerRowCls } from "@/app/components/inputStyles";
import pkg from "../../package.json";

interface Props {
  username: string;
  isGlobalAdmin: boolean;
  userId?: string;
  /** „Kein eigener Tracker" — siehe Glocken-Bedingung unten. */
  hideOwnTracker: boolean;
}

export default async function AdminHeader({ username, isGlobalAdmin, userId, hideOwnTracker }: Props) {
  const feedbackEnabled = process.env.DISABLE_FEEDBACK !== "true";
  const t = await getTranslations("adminNav");
  // Ein reiner Keyholder (role=user, kontrolliert Subs) landet im selben blauen Bereich wie ein Admin —
  // der Titel benennt aber die tatsächliche Rolle, damit „Adminportal" niemanden fälschlich zum Admin macht.
  const portalTitle = isGlobalAdmin ? t("portalAdmin") : t("portalKeyholder");

  return (
    <header className={headerBarCls}>
      <div className={headerRowCls}>
        <Link href="/admin" className={headerBrandCls}>
          {portalTitle}
        </Link>

        <div className={headerActionsCls}>
          {/* Der Posteingang gehört dem TRÄGER, und auf einer Ein-Personen-Instanz ist das dieselbe
              Person, die hier steht: ohne die Glocke verlor sie beim Wechsel in den Admin-Bereich
              den Zugang zu ihren eigenen Nachrichten (und das App-Badge lief weiter, ohne dass eine
              Seite es je zurücksetzte).

              NICHT bei „kein eigener Tracker": wer keinen hat, hat auch keinen Posteingang
              (`notifyControllers` schreibt bewusst keine Zeile für Keyholder), und `proxy.ts` leitet
              ihn von `/dashboard/*` nach `/admin` um — die Glocke wäre ein Knopf, der einen
              zurückwirft. Diese Bedingung bleibt auch mit Etappe 2 stehen: der Keyholder-Posteingang
              bekommt einen eigenen Nav-Eintrag über alle Subs, nicht diesen Platz
              (docs/nachrichten-konzept.md, §2.1). */}
          {userId && !hideOwnTracker && <HeaderMessages userId={userId} />}
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
