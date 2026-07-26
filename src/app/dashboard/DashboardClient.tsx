"use client";

import { useEffect } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import TimerDisplay from "@/app/components/TimerDisplay";
import Button from "@/app/components/Button";
import EmptyState from "@/app/components/EmptyState";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import DashboardBlock from "@/app/components/DashboardBlock";
import { formatHoursHM } from "@/lib/utils";
import { inspectionHelpUrl } from "@/lib/constants";
import { useLiveHours } from "@/app/hooks/useLiveHours";

// ── Types ────────────────────────────────────
export interface DashboardProps {
  currentStatus: { type: "VERSCHLUSS" | "OEFFNEN"; since: string } | null;
  /** Ende der laufenden Reinigungspause (ISO) — bis dahin führt ein Wiederverschluss dieselbe
   *  Session fort. `null`, wenn keine läuft. Reine Anzeige: der Verschluss-Zustand ist unberührt. */
  cleaningPauseUntil: string | null;
  hasEntries: boolean;

  // Kontrolle
  offeneKontrolle: {
    deadline: string;
    code: string;
    kommentar: string | null;
    overdue: boolean;
    href: string;
  } | null;

  // Verschluss-Anforderung
  offeneVerschlussAnf: {
    endetAt: string | null;
    nachricht: string | null;
    overdue: boolean;
    endetAtLabel: string | null;
    deviceName: string | null;
  } | null;

  // Sperrzeit
  activeSperrzeit: {
    endetAt: string | null;
    nachricht: string | null;
    endetAtLabel: string | null;
  } | null;

  // Orgasmus-Anforderung
  offeneOrgasmusAnf: {
    label: string;
    nachricht: string | null;
    windowLabel: string;
  } | null;

  // Stats
  tagH: number;
  wocheH: number;
  monatH: number;
  serverNow: string;
  elapsedTagH: number;
  elapsedWocheH: number;
  elapsedMonatH: number;

  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
}

// ── Helpers ──────────────────────────────────

function WearPercent({ wornH, elapsedH }: { wornH: number; elapsedH: number }) {
  if (elapsedH <= 0) return null;
  const pct = Math.min(100, Math.round((wornH / elapsedH) * 100));
  return (
    <div className="mt-2">
      <div className="h-1.5 rounded-full bg-border overflow-hidden">
        <div className="h-full rounded-full bg-lock" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-foreground-faint mt-0.5 tabular-nums">{pct}%</p>
    </div>
  );
}

// ── Component ────────────────────────────────
export default function DashboardClient(props: DashboardProps) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const {
    currentStatus,
    cleaningPauseUntil,
    hasEntries,
    offeneKontrolle,
    offeneVerschlussAnf,
    activeSperrzeit,
    offeneOrgasmusAnf,
    tagH: baseTagH,
    wocheH: baseWocheH,
    monatH: baseMonatH,
    serverNow,
    elapsedTagH: baseElapsedTagH,
    elapsedWocheH: baseElapsedWocheH,
    elapsedMonatH: baseElapsedMonatH,
    tz,
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

  // Lock-Request-Banner — auch im Empty-State sichtbar, sonst sehen frische User
  // mit einer offenen Anforderung nichts und reagieren nur auf die Mail.
  const lockRequestBanner = offeneVerschlussAnf ? (
    <LockRequestBanner
      variant="large"
      colorScheme="request"
      label={t("lockRequested")}
      nachricht={[offeneVerschlussAnf.deviceName ? t("lockDevicePrefix", { name: offeneVerschlussAnf.deviceName }) : null, offeneVerschlussAnf.nachricht].filter(Boolean).join(" · ") || null}
      endetAtLabel={offeneVerschlussAnf.endetAtLabel}
    />
  ) : null;

  const orgasmusRequestBanner = offeneOrgasmusAnf ? (
    <LockRequestBanner
      variant="large"
      colorScheme="orgasm"
      label={offeneOrgasmusAnf.label}
      nachricht={offeneOrgasmusAnf.nachricht}
      endetAtLabel={offeneOrgasmusAnf.windowLabel}
    />
  ) : null;

  if (!hasEntries) {
    return (
      <DashboardBlock as="main" className="flex flex-col gap-5">
        {lockRequestBanner}
        {orgasmusRequestBanner}
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
          <div className="px-5 py-4 text-white bg-gradient-to-br from-sky-600 to-sky-500">
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

      {/* ── Alert Banners ── */}
      {offeneKontrolle && (
        <KontrolleBanner
          deadline={new Date(offeneKontrolle.deadline)}
          code={offeneKontrolle.code}
          kommentar={offeneKontrolle.kommentar}
          overdue={offeneKontrolle.overdue}
          variant="large"
          href={offeneKontrolle.href}
          openLabel={t("inspectionRequired")}
          helpHref={inspectionHelpUrl(locale)}
          tz={tz}
        />
      )}

      {lockRequestBanner}

      {orgasmusRequestBanner}

      {/* Sperrzeit-Banner entfernt — wird bereits im Sperrzeit-Footer der LaufendeSessionCard angezeigt */}

      {/* ── Stats Summary ── */}
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">
            {t("statsTitle")}
          </p>
          <Link href="/dashboard/stats" className="text-xs text-foreground-faint hover:text-foreground-muted transition">
            {t("allStats")} →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-surface-raised px-3 py-3">
            <p className="text-xl font-bold text-lock tabular-nums">{formatHoursHM(tagH)}</p>
            <p className="text-xs text-foreground-faint mt-0.5">{t("wearToday")}</p>
            <WearPercent wornH={tagH} elapsedH={elapsedTagH} />
          </div>
          <div className="rounded-xl bg-surface-raised px-3 py-3">
            <p className="text-xl font-bold text-lock tabular-nums">{formatHoursHM(wocheH)}</p>
            <p className="text-xs text-foreground-faint mt-0.5">{t("wearWeek")}</p>
            <WearPercent wornH={wocheH} elapsedH={elapsedWocheH} />
          </div>
          <div className="rounded-xl bg-surface-raised px-3 py-3">
            <p className="text-xl font-bold text-lock tabular-nums">{formatHoursHM(monatH)}</p>
            <p className="text-xs text-foreground-faint mt-0.5">{t("wearMonth")}</p>
            <WearPercent wornH={monatH} elapsedH={elapsedMonatH} />
          </div>
        </div>
      </div>

      {/* Actions accessible via Neu-Button in bottom nav */}

    </DashboardBlock>
  );
}

