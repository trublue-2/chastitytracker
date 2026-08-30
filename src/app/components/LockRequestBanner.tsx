import Link from "next/link";
import { Droplets } from "lucide-react";
import { APP_TZ, formatDayTimeDual } from "@/lib/utils";
import type { ComponentType, ReactNode } from "react";
import LockPeriodRemaining from "./LockPeriodRemaining";
import { LockClosedIcon } from "@/app/components/lockIcons";
import Section from "@/app/components/Section";
import type { SectionTone } from "@/app/components/Section";
import { filledActionCls, warnEdgeCls } from "@/app/components/inputStyles";

type ColorScheme = "request" | "sperrzeit" | "orgasm";

/** Farbe der Nebenzeilen und des Zeichens — mehr braucht die Figur nicht, seit Grund, Rahmen und
 *  Radius weg sind. KEIN `tone`-Feld: es wäre die Identität des eigenen Schlüssels, und der Ton
 *  steht ohnehin schon als `overdue ? "warn" : colorScheme` an der Aufrufstelle. */
const COLORS: Record<ColorScheme, { text: string; accent: string }> = {
  request:   { text: "text-request-text",   accent: "text-request" },
  sperrzeit: { text: "text-sperrzeit-text", accent: "text-sperrzeit" },
  orgasm:    { text: "text-orgasm-text",    accent: "text-orgasm" },
};

/** Icon per color scheme — keeps the banner self-contained (no icon prop needed). */
const SCHEME_ICON: Record<ColorScheme, ComponentType<{ size?: number; className?: string }>> = {
  request: LockClosedIcon,
  sperrzeit: LockClosedIcon,
  orgasm: Droplets,
};

const WARN = { text: "text-warn-text", accent: "text-warn" };

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

    // Eine Zeile, kein Kasten — dieselbe Figur wie beim Kontroll-Banner daneben. Sie steht in einer
    // Liste, die sonst nur Haarlinien kennt; zwei Alarme untereinander in zwei Bauformen waren die
    // Hälfte des Fremdkörper-Eindrucks. Überfällig trägt links die Kante aus `OffenseCard`.
    return (
      <div className={`flex items-center justify-between gap-2 text-neben ${overdue ? `${warnEdgeCls} font-semibold` : ""}`}>
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
            <LockPeriodRemaining endetAt={new Date(endetAt).toISOString()} className={`text-xs opacity-70 ${c.accent}`} />
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

  /* Abschnitt statt Karte — dieselbe Figur wie das Kontroll-Banner, mit dem zusammen dieses hier
     im selben Stapel steht.

     Die alte Begründung („ein Alarm ist ein Einschub, er darf eine Form haben") war die Reaktion
     darauf, dass die Tönung nicht bis an die Spaltenkante lief. Der Grund dafür ist inzwischen
     benannt: `--block-gutter` steht in allen drei Layouts auf `0px`, der negative Rand des
     Schwester-Bauteils griff nie. Statt einer Form für die halbe Fläche gibt es jetzt gar keine
     Fläche — die Bedeutung trägt der Ton der Rubrik und ihrer Haarlinie.

     Anklickbar ist die beschriftete Aktion, nicht die ganze Fläche: eine Fläche, die es nicht mehr
     gibt, kann kein Klickziel sein. */
  // EIN Ausdruck für den Ton, nicht zwei: derselbe steht sieben Zeilen tiefer für die Aktion.
  const tone: SectionTone = overdue ? "warn" : colorScheme;
  return (
    <Section
      tone={tone}
      title={<span className="inline-flex items-center gap-1.5"><Icon size={13} aria-hidden />{label}</span>}
    >
      {nachricht && <p className={`text-neben ${c.accent}`}>{nachricht}</p>}
      {endetAtLabel && <p className="text-neben text-foreground-muted">{endetAtLabel}</p>}
      {cleaningNote && <p className="text-neben text-foreground-muted">{cleaningNote}</p>}
      {href && actionLabel && (
        <Link href={href} className={`${filledActionCls(tone)} self-start mt-1`}>
          {actionLabel}
        </Link>
      )}
    </Section>
  );
}
