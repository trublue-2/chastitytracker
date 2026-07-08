"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { formatDateTimeDual, toDateLocale, APP_TZ } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";

interface Props {
  deadline: Date;
  code: string;
  kommentar?: string | null;
  overdue: boolean;
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
  overdue,
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
          {overdue ? t("overdue") : t("until")}
          {" "}{deadlineStr}
          <span className="font-mono text-xs opacity-60 ml-auto">#{code}</span>
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
        <p className="text-sm font-bold">{overdue ? t("overdueTitle") : (openLabel ?? defaultOpenLabel)}</p>
        <p className="text-xs opacity-80">
          {overdue ? t("overduePrefix") : t("untilPrefix")} {deadlineStr} · {t("code")}:{" "}
          <span className="font-mono font-bold">{code}</span>
        </p>
        {kommentar && (
          <p className="text-xs font-medium mt-1 opacity-90">{t("instruction")}: {kommentar}</p>
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
      <a
        href={helpHref}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start text-xs font-medium text-inspect underline underline-offset-2 opacity-80 hover:opacity-100"
      >
        {t("help")}
      </a>
    </div>
  );
}
