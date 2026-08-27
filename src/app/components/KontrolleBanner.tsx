"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { formatDateTimeDual, toDateLocale, APP_TZ } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import HelpLink from "@/app/components/HelpLink";
import Section from "@/app/components/Section";
import type { SectionTone } from "@/app/components/Section";
import { cardActionCls } from "@/app/components/inputStyles";
import TimerDisplay from "@/app/components/TimerDisplay";
import { actionIcon } from "@/app/entries/actionSign";

/** Das Zeichen DIESER Sache aus der Registratur, nicht das Warndreieck der Gattung Alarm — und auf
 *  Modulebene, weil es konstant ist. Zwei Warnzeichen (Dreieck gegen Kreis) wären bei 13 px ohnehin
 *  nicht auseinanderzuhalten; derselbe Unterscheidungsfehler, den `lockIcons.ts` protokolliert. */
const ZEICHEN = actionIcon("PRUEFUNG");

/**
 * **Die Stufe an EINER Stelle** — Ton, Rubrik-Schlüssel, Richtungswort.
 *
 * Vorher stand die Fallunterscheidung zweimal in dieser Datei, einmal je Variante, als Ternär-
 * Ketten. Die beiden waren dadurch bereits auseinander: verschiedene Zeichengrössen (13 gegen 22),
 * verschiedene Schlüssel für dieselbe Aussage, verschiedene Typo-Skalen. Jetzt entscheiden die
 * Varianten nur noch über die DICHTE, nicht über die Aussage — dasselbe Muster wie
 * `SCHEDULED_KINDS` und `actionSign`.
 */
const STUFE = {
  laufend:      { ton: "inspect" as SectionTone, rubrik: "openTitle",    richtung: "untilPrefix",   kurz: "until"   },
  ueberfaellig: { ton: "warn"    as SectionTone, rubrik: "overdueTitle", richtung: "overduePrefix", kurz: "overdue" },
} as const;

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
  /** large only – Ziel des Erfassungs-Knopfes */
  href?: string;
  /** large only – link to the public "how inspections work" help (marketing site). */
  helpHref?: string;
  /** compact only – slot for withdraw X button */
  withdrawAction?: ReactNode;
}

/**
 * Die offene Kontrolle — als Abschnitt, nicht als Kasten.
 *
 * **Warum das umgebaut wurde.** Die grosse Variante trug `-mx-[var(--block-gutter,1rem)]`, um über
 * die volle Spaltenbreite zu laufen. Der Rückfallwert griff nie: alle drei Layouts, in denen das
 * Banner steht, setzen `--block-gutter` auf `0px`. Die getönte Fläche endete also 16 px vor der
 * Kante, ohne Radius — genau der scharfeckige Farbklotz, vor dem der Kommentar im Schwester-Bauteil
 * warnt. Dazu brachte sie `px-5` mit, während jede andere Zeile der Spalte auf `blockInsetCls`
 * steht: die fünfte linke Kante auf einem Bildschirm, der dafür extra eine Konstante hat.
 *
 * **Die Dringlichkeit kommt jetzt aus der Zahl, nicht aus der Fläche.** Sie MUSS von woanders
 * kommen: `warn` und `inspect` sind in allen drei Welten bitgleich (`docs/design/tokens.mjs`,
 * `FAMILIE` — „dieselbe Aufforderung, dringlicher"), der Farbwechsel bei `overdue` erzeugte also
 * identisches CSS. Was die Stufen trennt, sind drei unabhängige Achsen: das WORT (Rubrik), die
 * RICHTUNG („bis" gegen „seit") und die Struktur (Kante bzw. Zahlfarbe) — Farbe ist überall nur die
 * vierte, redundante. Die Frist war 12 px klein in einem lauten Kasten; jetzt ist sie die
 * zweitgrösste Zahl des Bildschirms in einem ruhigen Abschnitt. Das ist lauter, nicht leiser.
 *
 * `text-kennzahl` und nicht `text-zahl`: `StateHero` beansprucht die grösste Stufe für sich („Sie
 * IST der Bildschirm"), und zwei davon untereinander nehmen sich gegenseitig die Wirkung.
 */
export default function KontrolleBanner({
  deadline,
  code,
  kommentar,
  target,
  overdue,
  autoMarkAt,
  variant,
  href,
  helpHref,
  withdrawAction,
  tz = APP_TZ,
  viewerTz,
}: Props) {
  const t = useTranslations("kontrolleBanner");
  const dl = toDateLocale(useLocale());
  const deadlineStr = formatDateTimeDual(deadline, dl, viewerTz, tz, t("subTimePrefix"));
  const stufe = overdue ? STUFE.ueberfaellig : STUFE.laufend;

  if (variant === "compact") {
    // Eine Zeile, kein Streifen: kein Grund, keine Oberkante, keine eigene Polsterung. Sie steht in
    // einer Liste, die sonst nur Haarlinien kennt, und sah als getönter Balken darin aus wie ein
    // Fremdkörper. Überfällig trägt links dieselbe Kante wie `OffenseCard` — dieselbe Geste an
    // derselben Farbe, nicht eine neue Idee.
    return (
      <div className={`text-neben ${overdue ? "border-l-2 border-warn pl-3 font-semibold" : ""}`}>
        <div className="flex items-start gap-1.5">
          <ZEICHEN size={13} className={`mt-0.5 flex-shrink-0 ${overdue ? "text-warn" : "text-inspect"}`} aria-hidden />
          <span className="flex-1 min-w-0">
            {/* Die Kante ist Dekoration und trägt nichts vor — ohne dieses Präfix ist „überfällig"
                für einen Screenreader nur ein Wort im Satz wie jedes andere. */}
            {overdue && <span className="sr-only">{t("overdueTitle")} — </span>}
            <span className={overdue ? "text-warn-text" : "text-foreground-muted"}>
              {t(stufe.kurz)} {deadlineStr}
            </span>
            {/* Trennzeichen IM Span: zwischen zwei JSX-Ausdrücken auf eigenen Zeilen verwirft JSX
                den Whitespace, die Teile liefen sonst zusammen. */}
            {target && <span className="text-foreground-muted">{" · "}{target}</span>}
            {code && <span className="font-mono text-foreground-faint">{" · "}#{code}</span>}
          </span>
          {withdrawAction && <div className="relative z-20 flex-shrink-0">{withdrawAction}</div>}
        </div>
        {kommentar && <p className="text-foreground-muted mt-1">{t("instruction")}: {kommentar}</p>}
      </div>
    );
  }

  return (
    <Section
      tone={stufe.ton}
      title={
        <span className="inline-flex items-center gap-1.5">
          <ZEICHEN size={13} aria-hidden />{t(stufe.rubrik)}
        </span>
      }
    >
      {/* Die lebende Zahl über das vorhandene Bauteil: es bringt Takt, `formatElapsedMs`,
          `tabular-nums`, `suppressHydrationWarning` und — als Einziges — den `sr-only`-Vorspann
          mit, der „verbleibend" von „vergangen" unterscheidet. Hier standen dafür zwei eigene
          Ticker, von denen je Banner immer nur einer angezeigt wurde und der zweite trotzdem
          jede Minute lief. `whitespace-nowrap` wie beim `StateHero`: „365T 23h 59min" trifft
          sonst die Spaltenbreite. */}
      <TimerDisplay
        targetDate={deadline}
        mode={overdue ? "countup" : "countdown"}
        format="long"
        className={`block text-kennzahl font-semibold leading-none whitespace-nowrap ${overdue ? "text-warn" : "text-foreground"}`}
      />
      <p className="text-neben text-foreground-muted">
        {t(stufe.richtung)} {deadlineStr}
        {target && <>{" · "}{target}</>}
        {code && <> · {t("code")} <span className="font-mono text-foreground">{code}</span></>}
      </p>
      {kommentar && <p className="text-neben text-foreground-muted">{t("instruction")}: {kommentar}</p>}
      {/* Die Folge, bevor sie eintritt. Ohne diese Zeile erfuhr der Sub vom Eingriff erst, als er
          schon passiert war — die Automatik war für ihn ein Hinterhalt. */}
      {overdue && autoMarkAt && (
        <p className="text-neben font-semibold text-warn-text">
          {t("autoMarkWarn", { time: formatDateTimeDual(autoMarkAt, dl, viewerTz, tz, t("subTimePrefix")) })}
        </p>
      )}
      {/* Eine beschriftete Aktion statt „die ganze Fläche ist ein Link": ohne Fläche gibt es keine
          Fläche zum Anklicken. Nebenbei löst sich damit ein verschachteltes Bedienelement auf — die
          `actions` steckten bisher INNERHALB des Links. Das Ziel gehört in den Namen: bei zwei
          parallelen Kontrollen stünden sonst zwei Links mit identischer Beschriftung da. */}
      {href && (
        <Link href={href} className={`${cardActionCls(stufe.ton)} self-start mt-1`}>
          {t("capture")}{target ? <span className="sr-only">{" — "}{target}</span> : null}
        </Link>
      )}
      {helpHref && <HelpLink href={helpHref} label={t("help")} className={overdue ? "text-warn" : "text-inspect"} />}
    </Section>
  );
}
