"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { formatDayTimeDual, toDateLocale, APP_TZ } from "@/lib/utils";
import { useTranslations, useLocale } from "next-intl";
import Section from "@/app/components/Section";
import type { SectionTone } from "@/app/components/Section";
import { filledActionCls, warnEdgeCls } from "@/app/components/inputStyles";
import TimerDisplay from "@/app/components/TimerDisplay";
import { actionIcon } from "@/app/entries/actionSign";

/** Das Zeichen DIESER Sache aus der Registratur, nicht das Warndreieck der Gattung Alarm — und auf
 *  Modulebene, weil es konstant ist. */
const InspectionIcon = actionIcon("PRUEFUNG");

/**
 * **Die Stufe an EINER Stelle** — Ton, Rubrik, Richtungswort, Kante.
 *
 * Die Fallunterscheidung stand einmal zweimal in dieser Datei, je Variante als Ternär-Kette, und
 * war bereits auseinandergelaufen. Die Varianten entscheiden nur noch über die DICHTE.
 */
const URGENCY = {
  running: {
    tone: "inspect" as SectionTone, titleKey: "openTitle", prefixKey: "untilPrefix", shortKey: "until",
    edgeCls: "", weightCls: "", iconCls: "text-inspect", numberCls: "text-foreground", textCls: "text-foreground-muted",
  },
  overdue: {
    tone: "warn" as SectionTone, titleKey: "overdueTitle", prefixKey: "overduePrefix", shortKey: "overdue",
    edgeCls: warnEdgeCls, weightCls: "font-semibold", iconCls: "text-warn",
    numberCls: "text-warn", textCls: "text-warn-text",
  },
} as const;

interface Props {
  deadline: Date;
  /** Der Code, den der Träger aufs Bild schreibt. `null` = diese Kontrolle verlangt keinen (Gerät
   *  mit `requireInspectionCode: false`), dann entfällt die Zeile ganz.
   *
   *  Er stand hier einmal NICHT mehr, weil die Erfassungs-Seite ihn gross und mit Anleitung zeigt
   *  und ihn ohnehin vorbelegt — das Abtippen entfällt also. Der Fall, den das übersah: wer den
   *  Code auf einen Zettel schreibt und das Handy zum Fotografieren mitnimmt, braucht ihn, BEVOR
   *  er losgeht. Ohne Uhr am Arm gibt es dann keinen zweiten Bildschirm mehr, der ihn zeigt.
   *  Deshalb steht er hier — nur in der Träger-Sicht; die Keyholderin hat ihn verschickt. */
  code?: string | null;
  /** ZIEL der Kontrolle (Geräte- bzw. Kategoriename), null = KG. Steht in der RUBRIK, nicht in
   *  einer eigenen Zeile: es unterscheidet nur, wenn mehrere Kontrollen offen sind. */
  target?: string | null;
  overdue: boolean;
  /** Wann das System selbst eingreift. Ist die Automatik an, zählt die grosse Zahl im überfälligen
   *  Zustand DARAUF herunter — „3h 20min überfällig" ist keine Entscheidungsgrundlage mehr, das
   *  nächste Ereignis schon. */
  autoMarkAt?: Date | null;
  variant: "large" | "compact";
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
  /** Betrachter-Zeitzone (Keyholder). Weicht sie von `tz` ab, wird die Sub-Lokalzeit als Zusatz
   *  gezeigt. Nur im Admin-Portal gesetzt; im grünen Dashboard weglassen → reine Sub-Zeit. */
  viewerTz?: string;
  /** Ziel des Erfassungs-Knopfes (Träger-Sicht) — nur die GROSSE Fassung rendert ihn selbst. Die
   *  kompakte Zeile trägt keinen Knopf; wo sie anklickbar sein soll, umschliesst die Aufrufstelle
   *  sie mit einem `Link` und `rowHoverCls` (so die weiteren offenen Kontrollen in
   *  `DashboardAlerts`). Beides in dieses Bauteil zu ziehen lohnt erst beim zweiten solchen Ort. */
  href?: string;
  /** Der Rückzug. In der kompakten Zeile das Zeichen allein, in der grossen Fassung beschriftet —
   *  die Sub-Detailseite der Keyholderin hatte bis v6 GAR KEINE Aktion an diesem Block. */
  withdrawAction?: ReactNode;
}

/**
 * Die offene Kontrolle.
 *
 * **Der Block hatte kein Rang-, sondern ein Zuständigkeits-Problem.** Er zeigte Code, Anweisung und
 * Ziel — und alle drei stehen eine Berührung später nochmal, dort besser: das Erfassungs-Formular
 * zeigt den Code gross in Monoschrift samt „schreib das aufs Bild" und einem Knopf, der ihn auf die
 * Uhr schickt, die Anweisung in einer eigenen Warn-Fläche, das Ziel als Badge. Der Block
 * wiederholte also die Seite, bevor man sie erreichte. Deshalb hat Umsortieren nicht geholfen
 * („die vielen Informationen geben keine Führung", Rückmeldung 27.08.2026): drei Angaben mussten
 * dorthin zurück, wo sie gebraucht werden.
 *
 * Am Dashboard trifft der Träger genau EINE Entscheidung — jetzt oder später. Was die nicht speist,
 * ist hier unlesbar, weil es an keine Handlung anschliesst. Übrig bleiben vier Zeilen mit je einem
 * eigenen Job: was · wie dringend · wann genau · was tun.
 */
export default function KontrolleBanner({
  deadline,
  code,
  target,
  overdue,
  autoMarkAt,
  variant,
  href,
  withdrawAction,
  tz = APP_TZ,
  viewerTz,
}: Props) {
  const t = useTranslations("kontrolleBanner");
  const dl = toDateLocale(useLocale());
  const urgency = overdue ? URGENCY.overdue : URGENCY.running;
  const titleKey = `${t(urgency.titleKey)}${target ? ` · ${target}` : ""}`;

  if (variant === "compact") {
    // Eine Zeile, kein Streifen. Die Spanne ist RELATIV: die Keyholderin überfliegt diese Liste,
    // und „seit 3h 20min" rangiert, „27.08.2026, 22:01" nicht. Nebeneffekt, der zählt — eine
    // relative Spanne ist zeitzonenfrei, damit fallen drei Zeitangaben für eine Tatsache weg.
    return (
      <div className={`text-neben ${urgency.edgeCls} ${urgency.weightCls}`}>
        <div className="flex items-start gap-1.5">
          <InspectionIcon size={13} className={`mt-0.5 flex-shrink-0 ${urgency.iconCls}`} aria-hidden />
          <span className="flex-1 min-w-0">
            {/* Kein `sr-only`-Vorspann für die Kante: der sichtbare Satz beginnt bereits mit
                „Kontrolle überfällig seit …". Er stand hier und ergab vorgelesen „Kontrolle
                überfällig — Kontrolle überfällig seit 3h". */}
            {/* Über `TimerDisplay`, nicht über eine Differenz von Hand: `formatDurationBetween`
                rechnet `end − start`, und bei einer noch LAUFENDEN Frist ist das negativ — dafür
                gibt `formatDurationMs` ein blosses „–" zurück. Jede nicht-überfällige Zeile las
                sich damit als „Kontrolle bis –", ohne Fehler und ohne leeren Platz. Dazu tickt
                das Bauteil und ist hydrations-sicher; ein `new Date()` beim Rendern fror die
                Spanne ein und wich zwischen Server und Client ab. */}
            <span className={urgency.textCls}>
              {t(urgency.shortKey)}{" "}
              <TimerDisplay targetDate={deadline} mode={overdue ? "countup" : "countdown"} format="long" srPrefix={false} />
            </span>
            {target && <span className="text-foreground-muted">{" · "}{target}</span>}
          </span>
          {withdrawAction && <div className="relative z-20 flex-shrink-0">{withdrawAction}</div>}
        </div>
      </div>
    );
  }

  // Überfällig UND Automatik an: die Zahl zählt auf die Buchung, nicht auf eine verstrichene Frist.
  // Als DATUM geführt, nicht als Boolean — sonst bräuchte die Zeile darunter eine
  // Non-Null-Behauptung für einen Wert, den TypeScript selbst einengen kann.
  const autoMark = overdue ? autoMarkAt ?? null : null;

  return (
    <Section tone={urgency.tone} className={urgency.edgeCls}
      title={<span className="inline-flex items-center gap-1.5"><InspectionIcon size={13} aria-hidden />{titleKey}</span>}
    >
      {/* `TimerDisplay` bringt Takt, Formatierung, `tabular-nums`, `suppressHydrationWarning` und
          den `sr-only`-Vorspann „verbleibend/vergangen" mit. Kein `aria-live` — der Vorfall steht
          in `LiveStatus`. `whitespace-nowrap` wie beim `StateHero`. */}
      <TimerDisplay
        targetDate={autoMark ?? deadline}
        mode={overdue && !autoMark ? "countup" : "countdown"}
        format="long"
        /* KEINE eigene Farbe beim Countdown: `TimerDisplay` färbt dort selbst nach Restzeit
           (`phaseColor`), und zwei `text-*` am selben Element entscheidet die Reihenfolge im
           erzeugten Stylesheet — nicht die im String. Beim Hochzählen färbt das Bauteil nicht,
           dort trägt die Warnfarbe der Stufe. */
        className={`block text-kennzahl font-semibold leading-none whitespace-nowrap ${
          overdue && !autoMark ? urgency.numberCls : ""
        }`}
      />
      {autoMark ? (
        // Die Folge, bevor sie eintritt — ohne Zeitangabe im Text: die Zahl darüber IST sie.
        <p className="text-neben font-semibold text-warn-text">{t("autoMarkWarn")}</p>
      ) : (
        // Tag und Uhrzeit, kein Volldatum: bei einer Ein-Stunden-Frist war das Jahr im Zeitstempel
        // schlicht falsch dimensioniert.
        <p className="text-neben text-foreground-muted">
          {t(urgency.prefixKey)} {formatDayTimeDual(deadline, dl, viewerTz, tz, t("subTimePrefix"))}
        </p>
      )}
      {/* Zum ABSCHREIBEN gebaut, nicht zum Überfliegen: Monoschrift und weite Sperrung, damit
          sich 0/O und 1/l auf dem Zettel nicht verwechseln. Eigene Zeile statt Anhängsel an die
          Frist — zwei Zahlen in einer Zeile liest man als eine. */}
      {code && (
        <p className="text-neben text-foreground-muted">
          {t("code")} <span className="font-mono tracking-widest text-fliess text-foreground">{code}</span>
        </p>
      )}
      {href && (
        <Link href={href} className={`${filledActionCls(overdue ? "warn" : "inspect")} self-start mt-1`}>
          {t("capture")}
          {/* Bei zwei parallelen Kontrollen stünden sonst zwei Links mit identischem Namen da. */}
          {target && <span className="sr-only">{" — "}{target}</span>}
        </Link>
      )}
      {withdrawAction && <div className="self-start mt-1">{withdrawAction}</div>}
    </Section>
  );
}
