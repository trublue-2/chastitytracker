"use client";

import Link from "next/link";
import { Lock, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import TimerDisplay from "@/app/components/TimerDisplay";
import EmptyState from "@/app/components/EmptyState";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import { formatHoursHM } from "@/lib/utils";

// ── Types ────────────────────────────────────
export interface DashboardProps {
  currentStatus: { type: "VERSCHLUSS" | "OEFFNEN"; since: string } | null;
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
  } | null;

  // Sperrzeit
  activeSperrzeit: {
    endetAt: string | null;
    nachricht: string | null;
    endetAtLabel: string | null;
  } | null;

  // Stats
  tagH: number;
  wocheH: number;
  monatH: number;

  // Training
  activeVorgabe: {
    minProTagH: number | null;
    minProWocheH: number | null;
    minProMonatH: number | null;
  } | null;
}

// ── Helpers ──────────────────────────────────

function GoalProgress({ actual, target }: { actual: number; target: number }) {
  if (target <= 0) return null;
  const pct = Math.min(100, Math.round((actual / target) * 100));
  return (
    <div className="mt-2">
      <div className="h-1.5 rounded-full bg-background-subtle overflow-hidden">
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
  const {
    currentStatus,
    hasEntries,
    offeneKontrolle,
    offeneVerschlussAnf,
    activeSperrzeit,
    tagH,
    wocheH,
    monatH,
    activeVorgabe,
  } = props;

  const isLocked = currentStatus?.type === "VERSCHLUSS";
  const isOpen = !isLocked;

  // ── Empty state (no entries at all) ──
  if (!hasEntries) {
    return (
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8">
        <EmptyState
          icon={<Lock size={48} />}
          title={t("welcomeTitle")}
          description={t("welcomeDesc")}
          action={{ label: t("welcomeCta"), href: "/dashboard/new/verschluss" }}
        />
      </main>
    );
  }

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">

      {/* ── Status Hero (only when OPEN — when locked, LaufendeSessionCard handles this) ── */}
      {isOpen && (
        <div className="rounded-2xl overflow-hidden border border-unlock-border">
          <div className="px-5 py-4 text-white bg-gradient-to-br from-sky-600 to-sky-500">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10">
                <LockOpen size={28} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest opacity-60">
                  {t("openSince")}
                </p>
                {currentStatus && (
                  <TimerDisplay
                    targetDate={currentStatus.since}
                    mode="countup"
                    format="long"
                    className="!text-white text-2xl font-bold"
                  />
                )}
              </div>
            </div>
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
        />
      )}

      {offeneVerschlussAnf && (
        <LockRequestBanner
          variant="large"
          colorScheme="request"
          label={t("lockRequested")}
          nachricht={offeneVerschlussAnf.nachricht}
          endetAtLabel={offeneVerschlussAnf.endetAtLabel}
        />
      )}

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
            {activeVorgabe?.minProTagH != null && <GoalProgress actual={tagH} target={activeVorgabe.minProTagH} />}
          </div>
          <div className="rounded-xl bg-surface-raised px-3 py-3">
            <p className="text-xl font-bold text-lock tabular-nums">{formatHoursHM(wocheH)}</p>
            <p className="text-xs text-foreground-faint mt-0.5">{t("wearWeek")}</p>
            {activeVorgabe?.minProWocheH != null && <GoalProgress actual={wocheH} target={activeVorgabe.minProWocheH} />}
          </div>
          <div className="rounded-xl bg-surface-raised px-3 py-3">
            <p className="text-xl font-bold text-lock tabular-nums">{formatHoursHM(monatH)}</p>
            <p className="text-xs text-foreground-faint mt-0.5">{t("wearMonth")}</p>
            {activeVorgabe?.minProMonatH != null && <GoalProgress actual={monatH} target={activeVorgabe.minProMonatH} />}
          </div>
        </div>
      </div>

      {/* Actions accessible via Neu-Button in bottom nav */}

    </main>
  );
}

