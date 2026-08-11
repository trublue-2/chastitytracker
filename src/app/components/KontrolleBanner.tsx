"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { formatDateTimeDual, toDateLocale, APP_TZ } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import HelpLink from "@/app/components/HelpLink";

interface Props {
  deadline: Date;
  /** null = diese Kontrolle verlangt keinen Code (Gerät mit `requireInspectionCode: false`). Dann
   *  entfällt die Code-Anzeige ganz, statt „Code: —" zu behaupten, es gäbe einen. */
  code: string | null;
  kommentar?: string | null;
  /** ZIEL der Kontrolle (Geräte- bzw. Kategoriename), null = KG. Steht im Banner, weil der Sub
   *  sonst nicht weiss, WAS er fotografieren soll — bei mehreren parallelen Kontrollen entscheidet
   *  genau das. */
  target?: string | null;
  overdue: boolean;
  /** Wann das System selbst eingreift (Kontrolle als abgelegt buchen). Nur im ÜBERFÄLLIGEN
   *  large-Banner gezeigt: solange die Frist läuft, ist sie selbst die Nachricht — danach ist die
   *  Frage nicht mehr „bis wann", sondern „was passiert jetzt". */
  autoMarkAt?: Date | null;
  variant: "large" | "compact";
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
  /** Betrachter-Zeitzone (Keyholder). Weicht sie von `tz` ab, wird die Sub-Lokalzeit als Zusatz
   *  gezeigt. Nur im Admin-Portal gesetzt; im grünen Dashboard weglassen → reine Sub-Zeit. */
  viewerTz?: string;
  /** large only – renders as <Link> and shows "→ Jetzt erfassen" */
  href?: string;
  /** large only – slot for action buttons (e.g. KontrolleActions) */
  actions?: ReactNode;
  /** large only – link to the public "how inspections work" help (marketing site). Rendered as a
   *  small line beneath the banner so it stays outside the clickable capture Link. */
  helpHref?: string;
  /** large only – label when not overdue; pass translated string */
  openLabel?: string;
  /** compact only – slot for withdraw X button */
  withdrawAction?: ReactNode;
}

export default function KontrolleBanner({
  deadline,
  code,
  kommentar,
  target,
  overdue,
  autoMarkAt,
  variant,
  href,
  actions,
  helpHref,
  openLabel,
  withdrawAction,
  tz = APP_TZ,
  viewerTz,
}: Props) {
  const t = useTranslations("kontrolleBanner");
  const dl = toDateLocale(useLocale());
  const defaultOpenLabel = t("openTitle");
  const deadlineStr = formatDateTimeDual(deadline, dl, viewerTz, tz, t("subTimePrefix"));

  const colorCls = overdue
    ? "bg-warn-bg border-warn-border border-l-[3px] border-l-warn text-warn-text"
    : "bg-inspect-bg border-inspect-border border-l-[3px] border-l-inspect text-inspect-text";

  if (variant === "compact") {
    return (
      <div className={`rounded-xl px-3 py-2 text-xs font-medium flex flex-col gap-1 border ${colorCls}`}>
        <div className="flex items-center gap-1.5">
          {overdue
            ? <AlertCircle size={13} className="flex-shrink-0 text-warn" />
            : <AlertTriangle size={13} className="flex-shrink-0 text-inspect" />
          }
          {/* Trennzeichen IM Span: zwischen zwei JSX-Ausdrücken auf eigenen Zeilen verwirft JSX
              den Whitespace, „Plug" und „bis" liefen sonst zusammen. */}
          {target && <span className="font-semibold">{target} · </span>}
          {overdue ? t("overdue") : t("until")}
          {" "}{deadlineStr}
          {code && <span className="font-mono text-xs opacity-60 ml-auto">#{code}</span>}
          {withdrawAction && <div className="relative z-20 flex-shrink-0">{withdrawAction}</div>}
        </div>
        {kommentar && <p className="opacity-80">{t("instruction")}: {kommentar}</p>}
      </div>
    );
  }

  const inner = (
    <>
      {overdue
        ? <AlertCircle size={22} className="flex-shrink-0 text-warn" />
        : <AlertTriangle size={22} className="flex-shrink-0 text-inspect" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">
          {overdue ? t("overdueTitle") : (openLabel ?? defaultOpenLabel)}
          {target && <span className="font-semibold"> · {target}</span>}
        </p>
        <p className="text-xs opacity-80">
          {overdue ? t("overduePrefix") : t("untilPrefix")} {deadlineStr}
          {code && <> · {t("code")}: <span className="font-mono font-bold">{code}</span></>}
        </p>
        {kommentar && (
          <p className="text-xs font-medium mt-1 opacity-90">{t("instruction")}: {kommentar}</p>
        )}
        {/* Die Folge, bevor sie eintritt. Ohne diese Zeile erfuhr der Sub vom Eingriff erst, als er
            schon passiert war — die Automatik war für ihn ein Hinterhalt. */}
        {overdue && autoMarkAt && (
          <p className="text-xs font-semibold mt-1">
            {t("autoMarkWarn", { time: formatDateTimeDual(autoMarkAt, dl, viewerTz, tz, t("subTimePrefix")) })}
          </p>
        )}
      </div>
      {href && <span className="text-xs font-semibold opacity-70">{t("capture")}</span>}
      {actions}
    </>
  );

  const cls = `rounded-2xl px-5 py-4 flex items-center gap-3 border ${colorCls}`;
  const card = href
    ? <Link href={href} className={cls}>{inner}</Link>
    : <div className={cls}>{inner}</div>;

  if (!helpHref) return card;
  return (
    <div className="flex flex-col gap-1.5">
      {card}
      <HelpLink href={helpHref} label={t("help")} className="text-inspect" />
    </div>
  );
}
