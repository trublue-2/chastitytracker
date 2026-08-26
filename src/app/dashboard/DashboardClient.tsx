"use client";

import { useEffect } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import TimerDisplay from "@/app/components/TimerDisplay";
import Button from "@/app/components/Button";
import EmptyState from "@/app/components/EmptyState";
import Section from "@/app/components/Section";
import DashboardBlock from "@/app/components/DashboardBlock";
import { formatTotalHours } from "@/lib/utils";
import { coveragePct } from "@/lib/percent";
import StateHero from "@/app/components/StateHero";
import { useLiveHours } from "@/app/hooks/useLiveHours";

// ── Types ────────────────────────────────────
export interface DashboardProps {
  currentStatus: { type: "VERSCHLUSS" | "OEFFNEN"; since: string } | null;
  /** Ende der laufenden Reinigungspause (ISO) — bis dahin führt ein Wiederverschluss dieselbe
   *  Session fort. `null`, wenn keine läuft. Reine Anzeige: der Verschluss-Zustand ist unberührt. */
  cleaningPauseUntil: string | null;
  /** Die STRAFFRIST als fertige Uhrzeit in der Zone des Subs — nur gesetzt, wenn sie FRÜHER liegt
   *  als der Countdown, sonst sagt der Countdown schon alles. Ableitung in `dashboard/page.tsx`. */
  cleaningRelockWarnTime: string | null;
  /** Ist sie bereits verstrichen? Dann sagt die Zeile das im Perfekt statt eine Frist zu versprechen,
   *  die es nicht mehr gibt — die Pause läuft ja noch weiter. */
  cleaningRelockWarnPassed: boolean;
  hasEntries: boolean;

  // Die Anforderungen mit Frist (Kontrolle, Einschliessen, Orgasmus) stehen NICHT hier, sondern
  // im eigenen Block `DashboardAlerts` ganz oben auf der Seite — Begründung dort.

  // Stats
  tagH: number;
  wocheH: number;
  monatH: number;
  serverNow: string;
  elapsedTagH: number;
  elapsedWocheH: number;
  elapsedMonatH: number;
}

// ── Helpers ──────────────────────────────────

/**
 * Der Anteil der bisher VERSTRICHENEN Periode, den der Träger verschlossen war — nicht der Anteil
 * an einem Ziel. Der Unterschied war bis Etappe A unsichtbar: hier stand ein nacktes „81 %",
 * wenige Zeilen darüber in der Session-Karte ein „87 %" für dieselbe Dauer (dort gegen das
 * Tagesziel gerechnet). Zwei richtige Zahlen, kein Hinweis, wovon sie ein Anteil sind.
 *
 * Deshalb trägt diese Zahl ihren Nenner jetzt im Text (`{percent} % der bisherigen Tageszeit`) —
 * wie es die Jahresübersicht mit `percentLocked` schon immer tat. Die Zielbalken brauchen das
 * nicht: dort steht das `ist / soll` unmittelbar daneben.
 *
 * Der Text allein reichte nicht. Gelesen wird die FORM, nicht die 10-px-Zeile darunter: oben ein
 * zu einem Drittel gefüllter Ziel-Balken, 400 px tiefer ein randvoller für dieselbe Dauer — wer
 * scrollt, hält das Tagesziel für erfüllt und legt den Gürtel ab. Deshalb ist der verstrichene
 * Anteil keine Balkenform mehr.
 */
function WearPercent({ wornH, elapsedH, periodKey }: { wornH: number; elapsedH: number; periodKey: "coverageDay" | "coverageWeek" | "coverageMonth" }) {
  const t = useTranslations("dashboard");
  const pct = coveragePct(wornH, elapsedH);
  if (pct === null) return null;
  // Zehn Punkte = zehn Zehntel der bisher VERSTRICHENEN Periode. Ein Balken ist eine Füllgeste, er
  // läuft auf ein Ende zu, und ein volles Ende liest sich als „erreicht" — genau die Lesart, die
  // hier falsch ist. Eine Punktreihe ist abzählbar statt gefüllt. Dazu gedämpft statt in der
  // Zustandsfarbe: Vergangenes will nichts vom Nutzer, und Farbe trägt in diesem Entwurf nur, was
  // gerade etwas will. Damit unterscheiden sich die beiden Anzeigen doppelt — Form UND Farbe.
  //
  // Bewusst grob: der Zeitanteil ist eine Textur, die genaue Auskunft steht in der Zeile darunter.
  // `ceil` unten, Deckel oben: `round` liess die Reihe an BEIDEN Enden lügen. 95 % ergaben zehn von
  // zehn Punkten — also genau das Bild von 100 % und damit wieder das „voll heisst erreicht", gegen
  // das diese Form überhaupt gebaut wurde. Und 3 % ergaben null Punkte, ununterscheidbar von „gar
  // nicht getragen". Voll ist die Reihe jetzt nur bei 100.
  const filledDots = pct >= 100 ? 10 : Math.min(9, Math.max(1, Math.ceil(pct / 10)));
  return (
    <div className="mt-2">
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`size-1.5 rounded-full ${i < filledDots ? "bg-border-strong" : "bg-border-subtle"}`} />
        ))}
      </div>
      <p className="text-[10px] text-foreground-faint mt-1 tabular-nums">{t(periodKey, { percent: pct })}</p>
    </div>
  );
}

// ── Component ────────────────────────────────
export default function DashboardClient(props: DashboardProps) {
  const t = useTranslations("dashboard");
  const {
    currentStatus,
    cleaningPauseUntil,
    cleaningRelockWarnTime,
    cleaningRelockWarnPassed,
    hasEntries,
    tagH: baseTagH,
    wocheH: baseWocheH,
    monatH: baseMonatH,
    serverNow,
    elapsedTagH: baseElapsedTagH,
    elapsedWocheH: baseElapsedWocheH,
    elapsedMonatH: baseElapsedMonatH,
  } = props;

  const router = useRouter();
  const isLocked = currentStatus?.type === "VERSCHLUSS";

  // Nach Fristablauf zurück in den normalen „offen"-Zustand — EIN Timer, ausgelöst vom Effekt.
  // Nicht über `onExpire` von TimerDisplay: das feuert aus dem Render heraus und im Sekundentakt,
  // was React verbietet (setState einer fremden Komponente während des Renderns) und bei einer
  // vorgehenden Client-Uhr sekündlich einen vollständigen Server-Render auslösen würde.
  useEffect(() => {
    if (!cleaningPauseUntil) return;
    const restMs = new Date(cleaningPauseUntil).getTime() - Date.now();
    // Schon abgelaufen (Uhr-Versatz): einmal refreshen, nicht wiederholt.
    const timer = setTimeout(() => router.refresh(), Math.max(0, restMs) + 1000);
    return () => clearTimeout(timer);
  }, [cleaningPauseUntil, router]);
  const isOpen = !isLocked;

  // Der Timer im Status-Hero: während einer Reinigungspause die Restfrist, sonst die Dauer seit dem
  // Öffnen. `format="short"` (mm:ss) für den Countdown — `long` zeigt unter einer Stunde nur volle
  // Minuten und stünde die letzte, entscheidende Minute lang auf „0m".
  const heroTimer = cleaningPauseUntil
    ? { targetDate: cleaningPauseUntil, mode: "countdown" as const, format: "short" as const }
    : currentStatus
      ? { targetDate: currentStatus.since, mode: "countup" as const, format: "long" as const }
      : null;

  const tagH = useLiveHours(baseTagH, serverNow, isLocked);
  const wocheH = useLiveHours(baseWocheH, serverNow, isLocked);
  const monatH = useLiveHours(baseMonatH, serverNow, isLocked);
  const elapsedTagH = useLiveHours(baseElapsedTagH, serverNow, true);
  const elapsedWocheH = useLiveHours(baseElapsedWocheH, serverNow, true);
  const elapsedMonatH = useLiveHours(baseElapsedMonatH, serverNow, true);

  if (!hasEntries) {
    return (
      <DashboardBlock as="main" className="flex flex-col gap-4">
        <EmptyState
          icon={<Lock size={48} />}
          title={t("welcomeTitle")}
          description={t("welcomeDesc")}
          action={{ label: t("welcomeCta"), href: "/dashboard/new/verschluss" }}
        />
      </DashboardBlock>
    );
  }

  return (
    <DashboardBlock as="main" className="flex flex-col gap-4">

      {/* ── Status Hero (only when OPEN — when locked, LaufendeSessionCard handles this) ──
           Während einer laufenden Reinigungspause zeigt derselbe Platz die verbleibende Frist statt
           „Geöffnet seit": die Session ist nicht beendet, sie ist unterbrochen. Läuft die Frist ab,
           kehrt die Anzeige von selbst zum normalen „geöffnet" zurück (Timer im Effekt oben). */}
      {/* Der Held des OFFENEN Zustands — dieselbe Figur wie beim verschlossenen, deshalb dasselbe
          Bauteil (`StateHero`). Hier stand bis v6 die alte App: Verlaufskasten mit Rahmen, Zeichen
          in einer getönten Kachel, „OFFEN SEIT" über einer 24-px-Zahl in Weiss.

          `tone`: offen sein WILL nichts, also `quiet` — keine Farbe, kein Leuchten. Läuft eine
          Reinigungspause, gibt es eine Frist, und die will etwas: dann `warn`, die Restzeit statt
          der verstrichenen Zeit, und der Knopf, der die Frist beendet.

          Ohne `heroTimer` wird gar nichts gerendert: `currentStatus` kommt aus dem letzten
          KG-Eintrag, `hasEntries` aus ALLEN Eintragsarten — wer nur Orgasmen und Kontrollen erfasst
          hat, bekäme sonst eine Kopfzeile über einer fehlenden Zahl. */}
      {isOpen && heroTimer && (
        <StateHero
          tone={cleaningPauseUntil ? "warn" : "quiet"}
          word={cleaningPauseUntil ? t("cleaningPauseLabel") : t("openSince")}
          icon={<LockOpen size={15} strokeWidth={2.2} className="shrink-0" />}
          value={<TimerDisplay {...heroTimer} />}
          /* Die Folge, bevor sie eintritt. Der Countdown darüber sagt, wie lange die Session
             fortgeführt wird; wo die STRAFFRIST früher endet (Reinigungsfenster kürzer als das
             Kontingent), muss diese Zeile das sagen — sonst verschliesst er bei laufendem
             Countdown und hat ein Vergehen, das er sich nicht erklären kann. */
          footnote={cleaningRelockWarnTime && (
            <span className="font-medium text-warn">
              {t(cleaningRelockWarnPassed ? "cleaningRelockWarnPassed" : "cleaningRelockWarn", { time: cleaningRelockWarnTime })}
            </span>
          )}
        >
          {cleaningPauseUntil && (
            <Link href="/dashboard/new/verschluss" className="relative mt-4 block">
              <Button variant="semantic" semantic="lock" fullWidth icon={<Lock size={16} />}>
                {t("cleaningPauseRelock")}
              </Button>
            </Link>
          )}
        </StateHero>
      )}

      {/* Anforderungs-Banner: siehe `DashboardAlerts` (eigener Block ganz oben).
           Sperrzeit-Banner entfernt — steht bereits im Sperrzeit-Footer der LaufendeSessionCard. */}

      {/* ── Stats Summary ── */}
      <Section
        title={t("statsTitle")}
        action={
          <Link href="/dashboard/stats" className="text-neben text-foreground-faint hover:text-foreground-muted transition">
            {t("allStats")} →
          </Link>
        }
      >
        {/* Weder ein Kasten um den Block noch drei Kacheln darin — vier Zäune für drei Zahlen.
            Die Zahlen tragen sich selbst, der Abstand trennt sie.

            Die Kennzahl-Stufe gilt erst ab `sm`. Sie ist für eine DRITTEL-Spalte zu gross: mit der
            Wort-Schreibweise ist „475h 5min" bei 25 px breiter als 110 px und bricht zweizeilig um.
            Eine Zahl, die umbricht, ist keine Zahl mehr — dieselbe Regel wie beim Helden, nur
            andersherum angewandt. Darunter trägt `text-zeile`.

            `whitespace-nowrap` als Riegel dahinter: der Monatswert kann bis 1000 h die Minuten
            mitführen („744h 30min"), und dann ist der Rand auch bei 16 px dünn. Lieber überläuft
            die Spalte sichtbar, als dass die Zahl still zweizeilig wird. */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-zeile sm:text-kennzahl font-semibold text-lock tabular-nums whitespace-nowrap">{formatTotalHours(tagH)}</p>
            <p className="text-neben text-foreground-faint mt-0.5">{t("wearToday")}</p>
            <WearPercent wornH={tagH} elapsedH={elapsedTagH} periodKey="coverageDay" />
          </div>
          <div>
            <p className="text-zeile sm:text-kennzahl font-semibold text-lock tabular-nums whitespace-nowrap">{formatTotalHours(wocheH)}</p>
            <p className="text-neben text-foreground-faint mt-0.5">{t("wearWeek")}</p>
            <WearPercent wornH={wocheH} elapsedH={elapsedWocheH} periodKey="coverageWeek" />
          </div>
          <div>
            <p className="text-zeile sm:text-kennzahl font-semibold text-lock tabular-nums whitespace-nowrap">{formatTotalHours(monatH)}</p>
            <p className="text-neben text-foreground-faint mt-0.5">{t("wearMonth")}</p>
            <WearPercent wornH={monatH} elapsedH={elapsedMonatH} periodKey="coverageMonth" />
          </div>
        </div>
      </Section>

      {/* Actions accessible via Neu-Button in bottom nav */}

    </DashboardBlock>
  );
}

