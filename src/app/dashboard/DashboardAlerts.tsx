import { getTranslations } from "next-intl/server";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import DashboardBlock from "@/app/components/DashboardBlock";

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
  /** ALLE offenen Kontrollen, dringendste zuerst. Seit v5.0.1 kann je Ziel eine laufen (KG und
   *  Plug parallel) — eine einzelne würde die andere verschweigen, samt ihrer Frist. */
  offeneKontrollen: {
    deadline: string;
    /** null = Kontrolle ohne Code-Pflicht (Gerät mit `requireInspectionCode: false`). */
    code: string | null;
    /** Ziel (Geräte-/Kategoriename), null = KG. */
    target: string | null;
    overdue: boolean;
    href: string;
    /** Wann das System die Kontrolle selbsttätig als abgelegt bucht — null, wenn die Automatik aus
     *  ist. Steht nur im überfälligen Banner: vorher ist die Frist die Nachricht. */
    autoMarkAt: string | null;
  }[];

  offeneVerschlussAnf: {
    nachricht: string | null;
    endetAtLabel: string | null;
    /** Frist verstrichen — das Banner wechselt auf Warnfarbe. */
    overdue: boolean;
    /** Ziel des Banners: das Verschluss-Formular, wo möglich mit vorbelegtem Gerät. */
    href: string;
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
  offeneKontrollen,
  offeneVerschlussAnf,
  offeneOrgasmusAnf,
  tz,
}: DashboardAlertsProps) {
  if (offeneKontrollen.length === 0 && !offeneVerschlussAnf && !offeneOrgasmusAnf) return null;

  const t = await getTranslations("dashboard");

  return (
    <DashboardBlock className="flex flex-col gap-4">
      {/* NUR die nächste fällige — die Liste kommt dringendste zuerst. Zwei grosse Zahlen
          untereinander ergeben keine Rangfolge, sondern verdoppeln die Frage „was zuerst".
          Dass es weitere gibt, verschweigt der Bildschirm trotzdem nicht: die Zeile darunter
          sagt es, leise. */}
      {offeneKontrollen[0] && (
        <KontrolleBanner
          deadline={new Date(offeneKontrollen[0].deadline)}
          code={offeneKontrollen[0].code}
          target={offeneKontrollen[0].target}
          overdue={offeneKontrollen[0].overdue}
          autoMarkAt={offeneKontrollen[0].autoMarkAt ? new Date(offeneKontrollen[0].autoMarkAt) : null}
          variant="large"
          href={offeneKontrollen[0].href}
          tz={tz}
        />
      )}
      {offeneKontrollen.length > 1 && (
        <p className="text-neben text-foreground-faint">
          {t("moreInspections", { count: offeneKontrollen.length - 1 })}
        </p>
      )}

      {offeneVerschlussAnf && (
        <LockRequestBanner
          variant="large"
          colorScheme="request"
          label={t("lockRequested")}
          nachricht={offeneVerschlussAnf.nachricht}
          endetAtLabel={offeneVerschlussAnf.endetAtLabel}
          overdue={offeneVerschlussAnf.overdue}
          href={offeneVerschlussAnf.href}
          actionLabel={t("lockNow")}
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
