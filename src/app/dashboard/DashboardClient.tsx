"use client";

import Link from "next/link";
import { Lock, LockOpen, ClipboardCheck, Droplets, Clipboard, BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import StatusBadge from "@/app/components/StatusBadge";
import TimerDisplay from "@/app/components/TimerDisplay";
import Button from "@/app/components/Button";
import Card from "@/app/components/Card";
import StatsCard from "@/app/components/StatsCard";
import Badge from "@/app/components/Badge";
import EmptyState from "@/app/components/EmptyState";
import KontrolleBanner from "@/app/components/KontrolleBanner";
import LockRequestBanner from "@/app/components/LockRequestBanner";
import SessionTimeline from "@/app/components/SessionTimeline";
import Divider from "@/app/components/Divider";

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

  // Session events
  sessionEvents: {
    id: string;
    type: "VERSCHLUSS" | "OEFFNEN" | "PRUEFUNG" | "ORGASMUS" | "REINIGUNG";
    time: string;
    label?: string;
    note?: string;
  }[];
  sessionActive: boolean;

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

  // Recent entries
  recentEntries: {
    id: string;
    type: string;
    startTime: string;
    note: string | null;
  }[];
}

// ── Helpers ──────────────────────────────────
function formatHoursShort(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${Math.round(h * 10) / 10}h`;
}

function progressPercent(current: number, target: number | null | undefined): number | undefined {
  if (target == null || target <= 0) return undefined;
  return Math.min(100, (current / target) * 100);
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
    sessionEvents,
    sessionActive,
    tagH,
    wocheH,
    monatH,
    activeVorgabe,
    recentEntries,
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

  // ── Determine primary action ──
  const primaryAction = getPrimaryAction({
    isLocked,
    offeneKontrolle,
    offeneVerschlussAnf,
    activeSperrzeit,
    t,
  });

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">

      {/* ── Status Hero ── */}
      <Card padding="default">
        <div className="flex items-center gap-4">
          <StatusBadge
            status={isLocked ? "locked" : "unlocked"}
            duration=""
            size="large"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground-muted">
              {isLocked ? t("lockedSince") : t("openSince")}
            </p>
            {currentStatus && (
              <TimerDisplay
                targetDate={currentStatus.since}
                mode="countup"
                format="long"
                className="text-2xl"
              />
            )}
          </div>
        </div>
      </Card>

      {/* ── Primary Action ── */}
      {primaryAction && (
        <Link href={primaryAction.href}>
          <Button
            variant={primaryAction.variant}
            semantic={primaryAction.semantic}
            size="lg"
            fullWidth
            icon={primaryAction.icon}
          >
            {primaryAction.label}
          </Button>
        </Link>
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

      {activeSperrzeit && (
        <LockRequestBanner
          variant="large"
          colorScheme="sperrzeit"
          label={t("locked")}
          nachricht={activeSperrzeit.nachricht}
          endetAtLabel={activeSperrzeit.endetAtLabel}
        />
      )}

      {/* ── Session Timeline ── */}
      {sessionActive && sessionEvents.length > 0 && (
        <Card padding="default">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-3">
            {t("activeSession")}
          </p>
          <SessionTimeline
            isActive
            events={sessionEvents}
          />
        </Card>
      )}

      {/* ── Stats Summary ── */}
      <div className="grid grid-cols-3 gap-3">
        <StatsCard
          value={formatHoursShort(tagH)}
          label={t("wearToday")}
          variant={activeVorgabe?.minProTagH ? "progress" : "default"}
          progress={progressPercent(tagH, activeVorgabe?.minProTagH)}
          color="lock"
        />
        <StatsCard
          value={formatHoursShort(wocheH)}
          label={t("wearWeek")}
          variant={activeVorgabe?.minProWocheH ? "progress" : "default"}
          progress={progressPercent(wocheH, activeVorgabe?.minProWocheH)}
          color="lock"
        />
        <StatsCard
          value={formatHoursShort(monatH)}
          label={t("wearMonth")}
          variant={activeVorgabe?.minProMonatH ? "progress" : "default"}
          progress={progressPercent(monatH, activeVorgabe?.minProMonatH)}
          color="lock"
        />
      </div>

      {/* ── Secondary Action (Orgasm) ── */}
      <div className="flex gap-2">
        {isLocked && !offeneKontrolle && (
          <Link href="/dashboard/new/pruefung" className="flex-1">
            <Button variant="ghost" size="sm" fullWidth icon={<ClipboardCheck size={16} />}>
              {t("ctaInspectionOrUnlock")}
            </Button>
          </Link>
        )}
        <Link href="/dashboard/new/orgasmus" className="flex-1">
          <Button variant="ghost" size="sm" fullWidth icon={<Droplets size={16} />}>
            {t("ctaOrgasm")}
          </Button>
        </Link>
      </div>

      {/* ── Recent Entries ── */}
      {recentEntries.length > 0 && (
        <>
          <Divider />
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              {tCommon("entries")}
            </p>
            <Link href="/dashboard/eintraege" className="text-xs text-foreground-faint hover:text-foreground-muted transition">
              {t("sessions")} →
            </Link>
          </div>
          <Card padding="none">
            <div className="divide-y divide-border-subtle">
              {recentEntries.map((e) => (
                <RecentEntry key={e.id} entry={e} />
              ))}
            </div>
          </Card>
        </>
      )}
    </main>
  );
}

// ── Recent Entry Row ─────────────────────────
function RecentEntry({ entry }: { entry: DashboardProps["recentEntries"][number] }) {
  const date = new Date(entry.startTime);
  const typeConfig: Record<string, { icon: typeof Lock; variant: "lock" | "unlock" | "inspect" | "orgasm"; label: string }> = {
    VERSCHLUSS: { icon: Lock, variant: "lock", label: "Verschluss" },
    OEFFNEN: { icon: LockOpen, variant: "unlock", label: "Öffnen" },
    PRUEFUNG: { icon: ClipboardCheck, variant: "inspect", label: "Prüfung" },
    ORGASMUS: { icon: Droplets, variant: "orgasm", label: "Orgasmus" },
  };
  const cfg = typeConfig[entry.type] ?? typeConfig.VERSCHLUSS;

  return (
    <Link
      href={`/dashboard/edit/${entry.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-background-subtle transition-colors"
    >
      <Badge variant={cfg.variant} label={cfg.label} size="sm" icon={<cfg.icon size={12} />} />
      <span className="text-xs text-foreground-faint tabular-nums flex-shrink-0">
        {date.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" })}{" "}
        {date.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
      </span>
      {entry.note && (
        <span className="text-xs text-foreground-muted truncate">{entry.note}</span>
      )}
    </Link>
  );
}

// ── Primary Action Logic ─────────────────────
interface PrimaryActionParams {
  isLocked: boolean;
  offeneKontrolle: DashboardProps["offeneKontrolle"];
  offeneVerschlussAnf: DashboardProps["offeneVerschlussAnf"];
  activeSperrzeit: DashboardProps["activeSperrzeit"];
  t: ReturnType<typeof useTranslations>;
}

interface PrimaryAction {
  label: string;
  href: string;
  variant: "primary" | "secondary" | "danger" | "semantic";
  semantic?: "lock" | "unlock" | "inspect" | "warn" | "request";
  icon: React.ReactNode;
}

function getPrimaryAction({ isLocked, offeneKontrolle, offeneVerschlussAnf, activeSperrzeit, t }: PrimaryActionParams): PrimaryAction | null {
  // Priority 1: Control overdue (locked)
  if (isLocked && offeneKontrolle?.overdue) {
    return {
      label: t("ctaInspectionOverdue"),
      href: offeneKontrolle.href,
      variant: "semantic",
      semantic: "warn",
      icon: <ClipboardCheck size={20} />,
    };
  }

  // Priority 2: Control open (locked)
  if (isLocked && offeneKontrolle) {
    return {
      label: t("ctaInspection"),
      href: offeneKontrolle.href,
      variant: "semantic",
      semantic: "inspect",
      icon: <ClipboardCheck size={20} />,
    };
  }

  // Priority 3: Lock request overdue (open)
  if (!isLocked && offeneVerschlussAnf?.overdue) {
    return {
      label: t("ctaLockOverdue"),
      href: "/dashboard/new/verschluss",
      variant: "semantic",
      semantic: "warn",
      icon: <Lock size={20} />,
    };
  }

  // Priority 4: Lock request open (open)
  if (!isLocked && offeneVerschlussAnf) {
    return {
      label: t("ctaLockNow"),
      href: "/dashboard/new/verschluss",
      variant: "semantic",
      semantic: "request",
      icon: <Lock size={20} />,
    };
  }

  // Priority 5: Sperrzeit active (locked) — no prominent CTA
  if (isLocked && activeSperrzeit) {
    return {
      label: t("ctaUnlock"),
      href: "/dashboard/new/oeffnen",
      variant: "secondary",
      icon: <LockOpen size={20} />,
    };
  }

  // Priority 6: Standard — open → lock, locked → unlock
  if (!isLocked) {
    return {
      label: t("ctaLock"),
      href: "/dashboard/new/verschluss",
      variant: "semantic",
      semantic: "lock",
      icon: <Lock size={20} />,
    };
  }

  // Locked, no requests
  return {
    label: t("ctaUnlock"),
    href: "/dashboard/new/oeffnen",
    variant: "secondary",
    icon: <LockOpen size={20} />,
  };
}
