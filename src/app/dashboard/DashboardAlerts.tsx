import Link from "next/link";
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
  pendingInspections: {
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
    message: string | null;
    deadlineLabel: string | null;
    /** Frist verstrichen — das Banner wechselt auf Warnfarbe. */
    overdue: boolean;
    /** Ziel des Banners: das Verschluss-Formular, wo möglich mit vorbelegtem Gerät. */
    href: string;
  } | null;

  offeneOrgasmusAnf: {
    label: string;
    message: string | null;
    windowLabel: string;
  } | null;

  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
}

export default async function DashboardAlerts({
  pendingInspections,
  offeneVerschlussAnf,
  offeneOrgasmusAnf,
  tz,
}: DashboardAlertsProps) {
  if (pendingInspections.length === 0 && !offeneVerschlussAnf && !offeneOrgasmusAnf) return null;

  const t = await getTranslations("dashboard");

  return (
    <DashboardBlock className="flex flex-col gap-4">
      {/* GROSS nur die nächste fällige — die Liste kommt dringendste zuerst. Zwei grosse Zahlen
          untereinander ergeben keine Rangfolge, sondern verdoppeln die Frage „was zuerst".
          Die weiteren stehen darunter, leise, aber vollständig. */}
      {pendingInspections[0] && (
        <KontrolleBanner
          deadline={new Date(pendingInspections[0].deadline)}
          code={pendingInspections[0].code}
          target={pendingInspections[0].target}
          overdue={pendingInspections[0].overdue}
          autoMarkAt={pendingInspections[0].autoMarkAt ? new Date(pendingInspections[0].autoMarkAt) : null}
          variant="large"
          href={pendingInspections[0].href}
          tz={tz}
        />
      )}
      {/* Die weiteren offenen Kontrollen — kompakt, damit die Rangfolge oben erhalten bleibt, aber
          jede MIT ihrem Ziel, ihrer Frist und ihrem eigenen Weg ins Formular. Eine blosse Zählzeile
          stand hier und nannte nichts davon: für eine Kategorie-Kontrolle (Plug) war sie die
          einzige Spur auf dem ganzen Dashboard, denn die Session-Liste führt nur KG und das
          (+)-Sheet folgt ebenfalls nur der ersten. Wer sie übersah, verlor das Gerät an die
          Eskalation. Der Code steckt in der `href` — das Formular zeigt ihn. */}
      {pendingInspections.slice(1).map((k, i) => (
        <Link
          key={`${k.href}-${i}`}
          href={k.href}
          className="block -m-1 p-1 rounded-lg transition hover:bg-surface-raised"
        >
          <KontrolleBanner
            deadline={new Date(k.deadline)}
            target={k.target}
            overdue={k.overdue}
            variant="compact"
          />
        </Link>
      ))}

      {offeneVerschlussAnf && (
        <LockRequestBanner
          variant="large"
          colorScheme="request"
          label={t("lockRequested")}
          message={offeneVerschlussAnf.message}
          deadlineLabel={offeneVerschlussAnf.deadlineLabel}
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
          message={offeneOrgasmusAnf.message}
          deadlineLabel={offeneOrgasmusAnf.windowLabel}
        />
      )}
    </DashboardBlock>
  );
}
