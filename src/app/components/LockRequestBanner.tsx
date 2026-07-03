import { Lock, Droplets } from "lucide-react";
import { APP_TZ } from "@/lib/utils";
import type { ComponentType, ReactNode } from "react";
import SperrzeitRemaining from "./SperrzeitRemaining";

type ColorScheme = "request" | "sperrzeit" | "orgasm";

const COLORS: Record<ColorScheme, { bg: string; border: string; leftAccent: string; text: string; accent: string }> = {
  request: {
    bg: "bg-request-bg",
    border: "border-request-border",
    leftAccent: "border-l-[3px] border-l-request",
    text: "text-request-text",
    accent: "text-request",
  },
  sperrzeit: {
    bg: "bg-sperrzeit-bg",
    border: "border-sperrzeit-border",
    leftAccent: "border-l-[3px] border-l-sperrzeit",
    text: "text-sperrzeit-text",
    accent: "text-sperrzeit",
  },
  orgasm: {
    bg: "bg-orgasm-bg",
    border: "border-orgasm-border",
    leftAccent: "border-l-[3px] border-l-orgasm",
    text: "text-orgasm-text",
    accent: "text-orgasm",
  },
};

/** Icon per color scheme — keeps the banner self-contained (no icon prop needed). */
const SCHEME_ICON: Record<ColorScheme, ComponentType<{ size?: number; className?: string }>> = {
  request: Lock,
  sperrzeit: Lock,
  orgasm: Droplets,
};

const WARN = {
  bg: "bg-warn-bg",
  border: "border-warn-border",
  leftAccent: "border-l-[3px] border-l-warn",
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
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
  withdrawAction?: ReactNode;
  /** Shows a live countdown "Rest: …" next to the date. Requires endetAt. */
  showRemaining?: boolean;
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
    const { colorScheme, label, overdue, endetAt, locale, tz = APP_TZ, withdrawAction, showRemaining } = props;
    const c = overdue ? WARN : COLORS[colorScheme];
    const Icon = SCHEME_ICON[colorScheme];

    return (
      <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${c.bg} border ${c.border} ${c.leftAccent}`}>
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <Icon size={11} className={`flex-shrink-0 ${c.accent}`} />
          <span className={`text-xs font-medium truncate ${c.text}`}>{label}</span>
          {endetAt && (
            <span className={`text-xs opacity-70 flex-shrink-0 ${c.accent}`}>
              bis {new Date(endetAt).toLocaleString(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: tz })}
            </span>
          )}
          {showRemaining && endetAt && (
            <SperrzeitRemaining endetAt={new Date(endetAt).toISOString()} className={`text-xs opacity-70 ${c.accent}`} />
          )}
        </div>
        {withdrawAction && <div className="relative z-20 flex-shrink-0">{withdrawAction}</div>}
      </div>
    );
  }

  // Large variant (dashboard)
  const { colorScheme, label, nachricht, endetAtLabel } = props;
  const c = COLORS[colorScheme];
  const Icon = SCHEME_ICON[colorScheme];

  return (
    <div className={`flex flex-col gap-1.5 ${c.bg} border ${c.border} ${c.leftAccent} rounded-2xl px-5 py-4`}>
      <div className="flex items-center gap-2">
        <Icon size={15} className={`${c.accent} shrink-0`} />
        <p className={`text-sm font-bold ${c.text}`}>{label}</p>
      </div>
      {nachricht && <p className={`text-sm ${c.accent}`}>{nachricht}</p>}
      {endetAtLabel && <p className={`text-xs ${c.accent}`}>{endetAtLabel}</p>}
    </div>
  );
}
