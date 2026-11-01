import Link from "next/link";
import { getTranslations } from "next-intl/server";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import DashboardBlock from "@/app/components/DashboardBlock";
import BoxPhotoDueCard from "@/app/dashboard/BoxPhotoDueCard";
import { rowHoverCls } from "@/app/components/inputStyles";
import { leadAlertKind } from "@/lib/alertRank";

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
    /** Die Frist selbst (ISO) — nur für die Rangfolge; angezeigt wird `deadlineLabel`. */
    endsAt: string | null;
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

  /** Das Box-Foto, das nach „Riegel zu" fällig wurde — bleibt, bis es da ist oder erlassen wird. */
  boxPhotoDue: { entryId: string; mobileDesktopMode: boolean } | null;

  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
}

export default async function DashboardAlerts({
  pendingInspections,
  offeneVerschlussAnf,
  offeneOrgasmusAnf,
  boxPhotoDue,
  tz,
}: DashboardAlertsProps) {
  if (pendingInspections.length === 0 && !offeneVerschlussAnf && !offeneOrgasmusAnf && !boxPhotoDue) return null;

  const t = await getTranslations("dashboard");

  // GROSS steht genau EINE Pflicht, über alle Arten hinweg (`leadAlertKind`): drei grosse Blöcke mit
  // je eigenem Knopf ergeben keine Rangfolge, sondern verdoppeln die Frage „was zuerst". Die übrigen
  // stehen darunter, leise, aber vollständig und mit demselben Weg ins Formular.
  const [firstInspection, ...moreInspections] = pendingInspections;
  const lead = leadAlertKind([
    firstInspection ? { kind: "inspection", dueAtMs: new Date(firstInspection.deadline).getTime(), overdue: firstInspection.overdue } : null,
    offeneVerschlussAnf ? { kind: "lockRequest", dueAtMs: offeneVerschlussAnf.endsAt ? new Date(offeneVerschlussAnf.endsAt).getTime() : null, overdue: offeneVerschlussAnf.overdue } : null,
    offeneOrgasmusAnf ? { kind: "orgasm", dueAtMs: null, overdue: false } : null,
  ]);

  return (
    <DashboardBlock className="flex flex-col gap-4">
      {lead === "inspection" && firstInspection && (
        <KontrolleBanner
          deadline={new Date(firstInspection.deadline)}
          code={firstInspection.code}
          target={firstInspection.target}
          overdue={firstInspection.overdue}
          autoMarkAt={firstInspection.autoMarkAt ? new Date(firstInspection.autoMarkAt) : null}
          variant="large"
          href={firstInspection.href}
          tz={tz}
        />
      )}
      {lead === "lockRequest" && offeneVerschlussAnf && (
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
      {lead === "orgasm" && offeneOrgasmusAnf && (
        <LockRequestBanner
          variant="large"
          colorScheme="orgasm"
          label={offeneOrgasmusAnf.label}
          message={offeneOrgasmusAnf.message}
          deadlineLabel={offeneOrgasmusAnf.windowLabel}
        />
      )}

      {/* Kompakt: jede übrige Kontrolle MIT Ziel, Frist und eigenem Weg ins Formular — eine blosse
          Zählzeile verschwieg für eine Kategorie-Kontrolle (Plug) die einzige Spur auf dem ganzen
          Dashboard. Der Code steckt in der `href`, das Formular zeigt ihn. */}
      {(lead === "inspection" ? moreInspections : pendingInspections).map((k, i) => (
        <Link key={i} href={k.href} className={`block ${rowHoverCls}`}>
          <KontrolleBanner
            deadline={new Date(k.deadline)}
            target={k.target}
            overdue={k.overdue}
            variant="compact"
          />
        </Link>
      ))}
      {lead !== "lockRequest" && offeneVerschlussAnf && (
        <Link href={offeneVerschlussAnf.href} className={`block ${rowHoverCls}`}>
          <LockRequestBanner
            variant="compact"
            colorScheme="request"
            label={t("lockRequested")}
            deadlineLabel={offeneVerschlussAnf.deadlineLabel}
            overdue={offeneVerschlussAnf.overdue}
          />
        </Link>
      )}
      {lead !== "orgasm" && offeneOrgasmusAnf && (
        <LockRequestBanner
          variant="compact"
          colorScheme="orgasm"
          label={offeneOrgasmusAnf.label}
          deadlineLabel={offeneOrgasmusAnf.windowLabel}
        />
      )}

      {boxPhotoDue && <BoxPhotoDueCard entryId={boxPhotoDue.entryId} mobileDesktopMode={boxPhotoDue.mobileDesktopMode} />}
    </DashboardBlock>
  );
}
