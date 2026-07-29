import { getTranslations, getLocale } from "next-intl/server";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import DashboardBlock from "@/app/components/DashboardBlock";
import { inspectionHelpUrl } from "@/lib/constants";

/** Die Anforderungen mit Frist — Kontrolle, Einschliessen, Orgasmus.
 *
 *  Bewusst ein EIGENER Block ganz oben statt Teil des `DashboardClient`: dort sassen sie unterhalb
 *  von Box-Karte, Session-Karte, Trage-Sessions, Trainingsvorgaben und „Nicht getragen" und lagen
 *  damit je nach Ausstattung unter dem Fold — eine Frist, die man wegscrollen muss, verfehlt ihren
 *  Zweck (Rückmeldung 28.07.2026). Sie stehen jetzt vor allem anderen, auch vor der Box-Karte.
 *
 *  Rendert nichts, wenn keine Anforderung offen ist: als leerer Block wäre er kein Flex-Item mehr
 *  und überspringt seinen Abstand automatisch (siehe `DashboardBlock`). */
export interface DashboardAlertsProps {
  offeneKontrolle: {
    deadline: string;
    code: string;
    kommentar: string | null;
    overdue: boolean;
    href: string;
  } | null;

  offeneVerschlussAnf: {
    nachricht: string | null;
    endetAtLabel: string | null;
  } | null;

  offeneOrgasmusAnf: {
    label: string;
    nachricht: string | null;
    windowLabel: string;
  } | null;

  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
}

export default async function DashboardAlerts({
  offeneKontrolle,
  offeneVerschlussAnf,
  offeneOrgasmusAnf,
  tz,
}: DashboardAlertsProps) {
  if (!offeneKontrolle && !offeneVerschlussAnf && !offeneOrgasmusAnf) return null;

  const t = await getTranslations("dashboard");
  const locale = await getLocale();

  return (
    <DashboardBlock className="flex flex-col gap-4">
      {offeneKontrolle && (
        <KontrolleBanner
          deadline={new Date(offeneKontrolle.deadline)}
          code={offeneKontrolle.code}
          kommentar={offeneKontrolle.kommentar}
          overdue={offeneKontrolle.overdue}
          variant="large"
          href={offeneKontrolle.href}
          openLabel={t("inspectionRequired")}
          helpHref={inspectionHelpUrl(locale)}
          tz={tz}
        />
      )}

      {offeneVerschlussAnf && (
        <LockRequestBanner
          variant="large"
          colorScheme="request"
          label={t("lockRequested")}
          nachricht={offeneVerschlussAnf.nachricht}
          endetAtLabel={offeneVerschlussAnf.endetAtLabel}
        />
      )}

      {offeneOrgasmusAnf && (
        <LockRequestBanner
          variant="large"
          colorScheme="orgasm"
          label={offeneOrgasmusAnf.label}
          nachricht={offeneOrgasmusAnf.nachricht}
          endetAtLabel={offeneOrgasmusAnf.windowLabel}
        />
      )}
    </DashboardBlock>
  );
}
