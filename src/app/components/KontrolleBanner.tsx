import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import { getTranslations, getLocale } from "next-intl/server";

interface Props {
  deadline: Date;
  code: string;
  kommentar?: string | null;
  overdue: boolean;
  variant: "large" | "compact";
  /** large only – renders as <Link> and shows "→ Jetzt erfassen" */
  href?: string;
  /** large only – slot for action buttons (e.g. KontrolleActions) */
  actions?: ReactNode;
  /** large only – label when not overdue; pass translated string */
  openLabel?: string;
}

export default async function KontrolleBanner({
  deadline,
  code,
  kommentar,
  overdue,
  variant,
  href,
  actions,
  openLabel,
}: Props) {
  const t = await getTranslations("kontrolleBanner");
  const dl = toDateLocale(await getLocale());
  const defaultOpenLabel = t("openTitle");

  const colorCls = overdue
    ? "bg-warn-bg border-warn-border text-warn-text"
    : "bg-inspect-bg border-inspect-border text-inspect-text";

  if (variant === "compact") {
    return (
      <div className={`rounded-xl px-3 py-2 text-xs font-medium flex flex-col gap-1 border ${colorCls}`}>
        <div className="flex items-center gap-1.5">
          {overdue
            ? <AlertCircle size={13} className="flex-shrink-0 text-warn" />
            : <AlertTriangle size={13} className="flex-shrink-0 text-inspect" />
          }
          {overdue ? t("overdue") : t("until")}
          {" "}{formatDateTime(deadline, dl)}
          <span className="font-mono text-xs opacity-60 ml-auto">#{code}</span>
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
          {overdue ? t("overduePrefix") : t("untilPrefix")} {formatDateTime(deadline, dl)} · {t("code")}:{" "}
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

  if (href) {
    return <Link href={href} className={cls}>{inner}</Link>;
  }
  return <div className={cls}>{inner}</div>;
}
