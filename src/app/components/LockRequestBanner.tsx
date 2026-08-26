import Link from "next/link";
import { Droplets } from "lucide-react";
import { APP_TZ, formatDayTimeDual } from "@/lib/utils";
import type { ComponentType, ReactNode } from "react";
import SperrzeitRemaining from "./SperrzeitRemaining";
import { LockClosedIcon } from "@/app/components/lockIcons";

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
  request: LockClosedIcon,
  sperrzeit: LockClosedIcon,
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
  /** Betrachter-Zeitzone (Keyholder). Weicht sie von `tz` ab, wird die Sub-Lokalzeit als Zusatz
   *  gezeigt. Nur im Admin-Portal gesetzt (dort mit `subTimePrefix`); im Dashboard weglassen. */
  viewerTz?: string;
  /** Label des Sub-Zusatzes (i18n, z.B. „Sub"). Nur relevant, wenn `viewerTz` von `tz` abweicht. */
  subTimePrefix?: string;
  withdrawAction?: ReactNode;
  /** Shows a live countdown "Rest: …" next to the date. Requires endetAt. */
  showRemaining?: boolean;
  /** Erlaubt diese Sperre Reinigungsöffnungen? Fertig übersetzter Text (i18n bleibt beim Aufrufer,
   *  wie bei `label`). Weglassen = nicht anzeigen — der Sub, der grundsätzlich nicht reinigen darf,
   *  soll keine Zeile über etwas lesen, das seine Einstellung ohnehin verbietet. */
  cleaningNote?: string | null;
}

interface LargeProps {
  variant: "large";
  colorScheme: ColorScheme;
  label: string;
  nachricht?: string | null;
  /** Pre-formatted date string for endetAt display */
  endetAtLabel?: string | null;
  /** Siehe {@link CompactProps.cleaningNote}. */
  cleaningNote?: string | null;
  /** Frist verstrichen → Warnfarbe statt der ruhigen Schema-Farbe. Die compact-Variante konnte das
   *  von Anfang an, die grosse nicht: um 23 Uhr sah eine Anforderung „bis 20 Uhr" aus wie um
   *  Mittag, obwohl seit drei Stunden ein Vergehen läuft. */
  overdue?: boolean;
  /** Macht die Karte anklickbar — direkt aufs Formular, das die Anforderung erfüllt. Ohne ihn sind
   *  es drei Taps über den Plus-Knopf, und das Banner sagt nicht einmal, wohin. */
  href?: string;
  /** Beschriftung des Handlungs-Hinweises rechts (i18n beim Aufrufer, wie `label`). */
  actionLabel?: string | null;
}

type Props = CompactProps | LargeProps;

export default function LockRequestBanner(props: Props) {
  if (props.variant === "compact") {
    const { colorScheme, label, overdue, endetAt, locale, tz = APP_TZ, viewerTz, subTimePrefix, withdrawAction, showRemaining, cleaningNote } = props;
    const c = overdue ? WARN : COLORS[colorScheme];
    const Icon = SCHEME_ICON[colorScheme];

    return (
      <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${c.bg} border ${c.border} ${c.leftAccent}`}>
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <Icon size={11} className={`flex-shrink-0 ${c.accent}`} />
          <span className={`text-xs font-medium truncate ${c.text}`}>{label}</span>
          {endetAt && (
            <span className={`text-xs opacity-70 flex-shrink-0 ${c.accent}`}>
              {/* viewerTz wirkt nur mit Label — verhindert ein „· <leer> HH:mm", falls ein Aufrufer
                  viewerTz ohne subTimePrefix übergibt (ohne Label → reine Sub-Zeit). */}
              bis {formatDayTimeDual(endetAt, locale, subTimePrefix ? viewerTz : undefined, tz, subTimePrefix ?? "")}
            </span>
          )}
          {showRemaining && endetAt && (
            <SperrzeitRemaining endetAt={new Date(endetAt).toISOString()} className={`text-xs opacity-70 ${c.accent}`} />
          )}
          {cleaningNote && (
            <span className={`text-xs opacity-70 flex-shrink-0 ${c.accent}`}>· {cleaningNote}</span>
          )}
        </div>
        {withdrawAction && <div className="relative z-20 flex-shrink-0">{withdrawAction}</div>}
      </div>
    );
  }

  // Large variant (dashboard)
  const { colorScheme, label, nachricht, endetAtLabel, cleaningNote, overdue, href, actionLabel } = props;
  const c = overdue ? WARN : COLORS[colorScheme];
  const Icon = SCHEME_ICON[colorScheme];

  const inner = (
    <>
      <div className="flex items-center gap-2">
        <Icon size={15} className={`${c.accent} shrink-0`} />
        <p className={`text-sm font-bold ${c.text}`}>{label}</p>
        {href && actionLabel && (
          <span className={`ml-auto text-xs font-semibold opacity-70 ${c.text}`}>{actionLabel}</span>
        )}
      </div>
      {nachricht && <p className={`text-sm ${c.accent}`}>{nachricht}</p>}
      {endetAtLabel && <p className={`text-xs ${c.accent}`}>{endetAtLabel}</p>}
      {cleaningNote && <p className={`text-xs ${c.accent}`}>{cleaningNote}</p>}
    </>
  );

  /* Rahmen und Radius sind hier ZURÜCK, anders als bei den Blöcken. Die Regel „Tönung über die
     volle Breite mit einer Haarlinie oben" setzt voraus, dass die Fläche wirklich bis an den Rand
     läuft — innerhalb der Block-Spalte hört sie 16 px vorher auf, und dann steht ein scharfeckiger
     Farbklotz frei in der Seite. Ein Alarm ist kein Block, sondern ein Einschub: er darf eine Form
     haben. Was WIRKLICH nach Alarm aussah, war die Farbe, und die ist im Normalfall jetzt leise. */
  const cls = `flex flex-col gap-1.5 ${c.bg} border ${c.border} ${c.leftAccent} rounded-2xl px-5 py-4`;
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
}
