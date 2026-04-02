import { Lock } from "lucide-react";
import { formatDateTime, APP_TZ } from "@/lib/utils";
import type { ReactNode } from "react";

type ColorScheme = "request" | "sperrzeit";

const COLORS: Record<ColorScheme, { bg: string; border: string; text: string; accent: string }> = {
  request: {
    bg: "bg-request-bg",
    border: "border-request-border",
    text: "text-request-text",
    accent: "text-request",
  },
  sperrzeit: {
    bg: "bg-sperrzeit-bg",
    border: "border-sperrzeit-border",
    text: "text-sperrzeit-text",
    accent: "text-sperrzeit",
  },
};

const WARN = {
  bg: "bg-warn-bg",
  border: "border-warn-border",
  text: "text-warn-text",
  accent: "text-warn",
};

interface CompactProps {
  variant: "compact";
  colorScheme: ColorScheme;
  label: string;
  overdue?: boolean;
  endetAt?: Date | null;
  locale: string;
  withdrawAction?: ReactNode;
}

interface LargeProps {
  variant: "large";
  colorScheme: ColorScheme;
  label: string;
  nachricht?: string | null;
  /** Pre-formatted date string for endetAt display */
  endetAtLabel?: string | null;
}

type Props = CompactProps | LargeProps;

export default function LockRequestBanner(props: Props) {
  if (props.variant === "compact") {
    const { colorScheme, label, overdue, endetAt, locale, withdrawAction } = props;
    const c = overdue ? WARN : COLORS[colorScheme];

    return (
      <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${c.bg} border ${c.border}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <Lock size={11} className={`flex-shrink-0 ${c.accent}`} />
          <span className={`text-xs font-medium truncate ${c.text}`}>{label}</span>
          {endetAt && (
            <span className={`text-xs opacity-70 flex-shrink-0 ${c.accent}`}>
              bis {new Date(endetAt).toLocaleString(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}
            </span>
          )}
        </div>
        {withdrawAction && <div className="relative z-20 flex-shrink-0">{withdrawAction}</div>}
      </div>
    );
  }

  // Large variant (dashboard)
  const { colorScheme, label, nachricht, endetAtLabel } = props;
  const c = COLORS[colorScheme];

  return (
    <div className={`flex flex-col gap-1.5 ${c.bg} border ${c.border} rounded-2xl px-5 py-4`}>
      <div className="flex items-center gap-2">
        <Lock size={15} className={`${c.accent} shrink-0`} />
        <p className={`text-sm font-bold ${c.text}`}>{label}</p>
      </div>
      {nachricht && <p className={`text-sm ${c.accent}`}>{nachricht}</p>}
      {endetAtLabel && <p className={`text-xs ${c.accent}`}>{endetAtLabel}</p>}
    </div>
  );
}
