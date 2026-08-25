"use client";

import { useEffect } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import TimerDisplay from "@/app/components/TimerDisplay";
import Button from "@/app/components/Button";
import EmptyState from "@/app/components/EmptyState";
import BlockHeading from "@/app/components/BlockHeading";
import DashboardBlock from "@/app/components/DashboardBlock";
import { formatTotalHours } from "@/lib/utils";
import { coveragePct } from "@/lib/percent";
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
 * Deshalb trägt diese Zahl ihren Nenner jetzt im Text (`{percent} % des Tages`) — wie es die
 * Jahresübersicht mit `percentLocked` schon immer tat. Die Zielbalken brauchen das nicht: dort
 * steht das `ist / soll` unmittelbar daneben.
 */
function WearPercent({ wornH, elapsedH, periodKey }: { wornH: number; elapsedH: number; periodKey: "coverageDay" | "coverageWeek" | "coverageMonth" }) {
  const t = useTranslations("dashboard");
  const pct = coveragePct(wornH, elapsedH);
  if (pct === null) return null;
  return (
    <div className="mt-2">
      <div className="h-1.5 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full bg-lock" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-foreground-faint mt-0.5 tabular-nums">{t(periodKey, { percent: pct })}</p>
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
      <DashboardBlock as="main" className="flex flex-col gap-5">
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
    <DashboardBlock as="main" className="flex flex-col gap-5">

      {/* ── Status Hero (only when OPEN — when locked, LaufendeSessionCard handles this) ──
           Während einer laufenden Reinigungspause zeigt derselbe Platz die verbleibende Frist statt
           „Geöffnet seit": die Session ist nicht beendet, sie ist unterbrochen. Läuft die Frist ab,
           kehrt die Anzeige von selbst zum normalen „geöffnet" zurück (Timer im Effekt oben). */}
      {isOpen && (
        <div className="rounded-2xl overflow-hidden border border-unlock-border">
          <div className="px-5 py-4 text-white bg-gradient-to-br from-[var(--color-unlock-border)] to-[var(--color-unlock)]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10">
                <LockOpen size={28} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest opacity-60">
                  {cleaningPauseUntil ? t("cleaningPauseLabel") : t("openSince")}
                </p>
                {heroTimer && <TimerDisplay {...heroTimer} className="!text-white text-2xl font-bold" />}
              </div>
            </div>
            {/* Die Folge, bevor sie eintritt. Der Countdown darüber sagt, wie lange die Session
                fortgeführt wird; wo die STRAFFRIST früher endet (Reinigungsfenster kürzer als das
                Kontingent), muss diese Zeile das sagen — sonst verschliesst er bei grünem Countdown
                und hat ein Vergehen, das er sich nicht erklären kann. */}
            {cleaningRelockWarnTime && (
              <p className="mt-3 text-sm font-medium text-white/90">
                {t(cleaningRelockWarnPassed ? "cleaningRelockWarnPassed" : "cleaningRelockWarn", { time: cleaningRelockWarnTime })}
              </p>
            )}
            {cleaningPauseUntil && (
              <Link href="/dashboard/new/verschluss" className="mt-4 block">
                <Button variant="semantic" semantic="lock" fullWidth icon={<Lock size={16} />}>
                  {t("cleaningPauseRelock")}
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Anforderungs-Banner: siehe `DashboardAlerts` (eigener Block ganz oben).
           Sperrzeit-Banner entfernt — steht bereits im Sperrzeit-Footer der LaufendeSessionCard. */}

      {/* ── Stats Summary ── */}
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <BlockHeading>
            {t("statsTitle")}
          </BlockHeading>
          <Link href="/dashboard/stats" className="text-xs text-foreground-faint hover:text-foreground-muted transition">
            {t("allStats")} →
          </Link>
        </div>
        {/* Die Zahl ist auf dem Handy eine Stufe kleiner als ab `sm:`. Mit der Wort-Schreibweise
            (Etappe A) ist „17T 14h 46min" schlicht zu lang für ein Drittel von 375 px: bei
            `text-xl` brach sie auf DREI Zeilen. Zwei Zeilen mit engem Durchschuss sind der
            ehrliche Kompromiss, bis Etappe E den Block ohnehin anfasst. */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-surface-raised px-3 py-3">
            <p className="text-base sm:text-xl leading-tight font-bold text-lock tabular-nums">{formatTotalHours(tagH)}</p>
            <p className="text-xs text-foreground-faint mt-0.5">{t("wearToday")}</p>
            <WearPercent wornH={tagH} elapsedH={elapsedTagH} periodKey="coverageDay" />
          </div>
          <div className="rounded-xl bg-surface-raised px-3 py-3">
            <p className="text-base sm:text-xl leading-tight font-bold text-lock tabular-nums">{formatTotalHours(wocheH)}</p>
            <p className="text-xs text-foreground-faint mt-0.5">{t("wearWeek")}</p>
            <WearPercent wornH={wocheH} elapsedH={elapsedWocheH} periodKey="coverageWeek" />
          </div>
          <div className="rounded-xl bg-surface-raised px-3 py-3">
            <p className="text-base sm:text-xl leading-tight font-bold text-lock tabular-nums">{formatTotalHours(monatH)}</p>
            <p className="text-xs text-foreground-faint mt-0.5">{t("wearMonth")}</p>
            <WearPercent wornH={monatH} elapsedH={elapsedMonatH} periodKey="coverageMonth" />
          </div>
        </div>
      </div>

      {/* Actions accessible via Neu-Button in bottom nav */}

    </DashboardBlock>
  );
}

