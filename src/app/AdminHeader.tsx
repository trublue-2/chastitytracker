import Link from "next/link";
import { getTranslations } from "next-intl/server";
import AvatarMenu from "@/app/components/AvatarMenu";
import FeedbackButton from "@/app/components/FeedbackButton";
import HeaderMessages from "@/app/components/HeaderMessages";
import { headerActionsCls, headerBarCls, headerBrandCls, headerRowCls } from "@/app/components/inputStyles";
import type { OwnTrackerActor } from "@/lib/ownTracker";
import pkg from "../../package.json";

interface Props {
  username: string;
  /** Der Handelnde als Ganzes statt nur seiner id: die Glocke braucht ausserdem Rolle und
   *  „kontrolliert Subs", um ihre beiden Zähler ohne zusätzliche Abfrage zu entscheiden — und die
   *  Rolle beantwortet zugleich „globaler Admin?". Beides kam bisher getrennt vom selben Aufrufer,
   *  aus derselben Session; ein zweites Prop dafür konnte nur noch widersprüchlich sein. */
  actor?: OwnTrackerActor;
  /** „Kein eigener Tracker" — hier nur noch fürs Badge (siehe `HeaderMessages`), nicht mehr für die
   *  Glocke: die meint im blauen Bereich den Keyholder-Posteingang. */
  hideOwnTracker: boolean;
}

export default async function AdminHeader({ username, actor, hideOwnTracker }: Props) {
  const feedbackEnabled = process.env.DISABLE_FEEDBACK !== "true";
  const t = await getTranslations("adminNav");
  const isGlobalAdmin = actor?.role === "admin";
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
          {/* Im blauen Bereich meint die Glocke den Posteingang des KEYHOLDERS — die Meldungen über
              seine Träger, die `notifyControllers` schreibt. Sie ist zugleich die einzige Tür dorthin
              (kein Nav-Eintrag).

              Damit fällt die frühere „kein eigener Tracker"-Bedingung hier weg: sie schützte davor,
              auf einen Posteingang zu zeigen, den es für diese Person nicht gibt — wer hier steht,
              kontrolliert aber Träger, und dieser Posteingang ist genau seiner. Der EIGENE bleibt am
              grünen Kopf, mit seiner Bedingung. */}
          {actor && (
            <HeaderMessages actor={actor} scope="keyholder" ownInboxReachable={!hideOwnTracker} />
          )}
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
