"use client";

import { useState } from "react";
import {
  Lock, LockOpen, Plus, Download, X, RefreshCw,
  ChevronLeft, ArrowLeftRight, ChevronRight, CheckCircle2, Droplets,
} from "lucide-react";

import Button from "@/app/components/Button";
import CalendarContainer from "@/app/components/CalendarContainer";
import MonthStats from "@/app/components/MonthStats";
import KontrolleItemListClient from "@/app/components/KontrolleItemListClient";
import OrgasmenListClient from "@/app/components/OrgasmenListClient";
import NewEntrySheet from "@/app/components/NewEntrySheet";
import AvatarMenu from "@/app/components/AvatarMenu";
import LocaleSwitcher from "@/app/components/LocaleSwitcher";
import UserContextBar from "@/app/admin/users/[id]/UserContextBar";
import UserSubNav from "@/app/admin/users/[id]/UserSubNav";
import PhotoCapture from "@/app/components/PhotoCapture";
import Toggle from "@/app/components/Toggle";
import SessionEventRow from "@/app/dashboard/SessionEventRow";
import SessionDurationBadge from "@/app/dashboard/SessionDurationBadge";

import {
  MOCK_CALENDAR_MONTHS,
  MOCK_MONTH_STATS,
  MOCK_KONTROLLE_ITEMS,
  MOCK_ORGASMEN_ITEMS,
  MOCK_USERS,
} from "./mockData";

// ── Media ─────────────────────────────────────

export function PhotoCaptureDemo() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-foreground-faint font-mono">variant=&quot;emerald&quot;</p>
      <PhotoCapture onFile={() => {}} uploading={false} variant="emerald" />
      <p className="text-xs text-foreground-faint font-mono">variant=&quot;orange&quot; compact</p>
      <PhotoCapture onFile={() => {}} uploading={false} variant="orange" compact />
    </div>
  );
}

export function ImageViewerDemo() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground-muted">
        ImageViewer zeigt ein Thumbnail, das bei Klick als Fullscreen-Modal mit Pinch-Zoom öffnet.
        Benötigt ein echtes Bild via <code className="text-xs font-mono bg-surface-raised px-1 py-0.5 rounded">/api/uploads/</code>.
      </p>
      <div className="w-16 h-16 rounded-xl bg-surface-raised flex items-center justify-center text-foreground-faint text-xs">
        16×16
      </div>
    </div>
  );
}

// ── Session Event Row ─────────────────────────

export function SessionEventRowDemo() {
  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden divide-y divide-border-subtle">
      <p className="px-5 pt-3 text-[10px] text-foreground-faint font-mono">type=&quot;verschluss&quot;</p>
      <SessionEventRow
        icon={<Lock size={18} className="text-lock" />}
        ev={{
          type: "verschluss", dateStr: "02.04.2026", timeStr: "23:47",
          imageUrl: null, exifStr: null, note: "Siegel #48291", entryId: "demo-v",
          captureHref: null, deadlineStr: null, isOverdue: false,
          kontrolleCode: null, kontrolleKommentar: null,
          kombiniertePillLabel: null, kombiniertePillCls: null, orgasmusArt: null,
        }}
      />
      <p className="px-5 pt-3 text-[10px] text-foreground-faint font-mono">type=&quot;kontrolle&quot; — erfüllt + KI-verifiziert</p>
      <SessionEventRow
        icon={<CheckCircle2 size={18} className="text-[var(--color-inspect)]" />}
        ev={{
          type: "kontrolle", dateStr: "03.04.2026", timeStr: "14:30",
          imageUrl: null, exifStr: null, note: "Code korrekt", entryId: "demo-k",
          captureHref: null, deadlineStr: "03.04.2026, 18:30", isOverdue: false,
          kontrolleCode: "73519", kontrolleKommentar: null,
          kombiniertePillLabel: "Selbstkontrolle – Verifiziert",
          kombiniertePillCls: "bg-ok-bg text-ok-text border border-ok-border",
          orgasmusArt: null,
        }}
      />
      <p className="px-5 pt-3 text-[10px] text-foreground-faint font-mono">type=&quot;kontrolle&quot; — offen (captureHref → Banner)</p>
      <SessionEventRow
        icon={<CheckCircle2 size={18} className="text-[var(--color-inspect)]" />}
        ev={{
          type: "kontrolle", dateStr: "03.04.2026", timeStr: "10:00",
          imageUrl: null, exifStr: null, note: null, entryId: null,
          captureHref: "#", deadlineStr: "03.04.2026, 14:00", isOverdue: false,
          kontrolleCode: "90811", kontrolleKommentar: "Bitte Siegel prüfen",
          kombiniertePillLabel: null, kombiniertePillCls: null, orgasmusArt: null,
        }}
      />
      <p className="px-5 pt-3 text-[10px] text-foreground-faint font-mono">type=&quot;kontrolle&quot; — überfällig</p>
      <SessionEventRow
        icon={<CheckCircle2 size={18} className="text-[var(--color-inspect)]" />}
        ev={{
          type: "kontrolle", dateStr: "01.04.2026", timeStr: "20:00",
          imageUrl: null, exifStr: null, note: null, entryId: null,
          captureHref: "#", deadlineStr: "02.04.2026, 00:00", isOverdue: true,
          kontrolleCode: "55123", kontrolleKommentar: "Dringend!",
          kombiniertePillLabel: null, kombiniertePillCls: null, orgasmusArt: null,
        }}
      />
      <p className="px-5 pt-3 text-[10px] text-foreground-faint font-mono">type=&quot;reinigung&quot; — mit Pausendauer</p>
      <SessionEventRow
        icon={<LockOpen size={18} className="text-[var(--color-unlock)]" />}
        ev={{
          type: "reinigung", dateStr: "03.04.2026", timeStr: "07:00",
          imageUrl: null, exifStr: null, note: null, entryId: "demo-r",
          captureHref: null, deadlineStr: null, isOverdue: false,
          kontrolleCode: null, kontrolleKommentar: null,
          kombiniertePillLabel: null, kombiniertePillCls: null, orgasmusArt: null,
          pauseDurationStr: "15 Min. Pause",
        }}
      />
      <p className="px-5 pt-3 text-[10px] text-foreground-faint font-mono">type=&quot;orgasmus&quot;</p>
      <SessionEventRow
        icon={<Droplets size={18} className="text-[var(--color-orgasm)]" />}
        ev={{
          type: "orgasmus", dateStr: "02.04.2026", timeStr: "22:30",
          imageUrl: null, exifStr: null, note: "Erlaubt", entryId: "demo-o",
          captureHref: null, deadlineStr: null, isOverdue: false,
          kontrolleCode: null, kontrolleKommentar: null,
          kombiniertePillLabel: null, kombiniertePillCls: null,
          orgasmusArt: "ruinierter Orgasmus",
        }}
      />
    </div>
  );
}

// ── Datenlisten ───────────────────────────────

export function CalendarContainerDemo() {
  return <CalendarContainer months={MOCK_CALENDAR_MONTHS} />;
}

export function MonthStatsDemo() {
  return <MonthStats months={MOCK_MONTH_STATS} />;
}

export function KontrolleListDemo() {
  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <KontrolleItemListClient items={MOCK_KONTROLLE_ITEMS} imageAlt="Demo" />
    </div>
  );
}

export function OrgasmenListDemo() {
  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
      <OrgasmenListClient items={MOCK_ORGASMEN_ITEMS} />
    </div>
  );
}

// ── Navigation Chrome ─────────────────────────

export function NewEntrySheetDemo() {
  const [openLocked, setOpenLocked] = useState(false);
  const [openUnlocked, setOpenUnlocked] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="semantic" semantic="lock" size="sm" onClick={() => setOpenLocked(true)}>
        Sheet (verschlossen)
      </Button>
      <Button variant="semantic" semantic="unlock" size="sm" onClick={() => setOpenUnlocked(true)}>
        Sheet (offen)
      </Button>
      <NewEntrySheet open={openLocked} onClose={() => setOpenLocked(false)} isLocked={true} />
      <NewEntrySheet open={openUnlocked} onClose={() => setOpenUnlocked(false)} isLocked={false} />
      <p className="w-full text-[10px] text-foreground-faint mt-1">
        Portale öffnen sich im Admin-Theme unabhängig von der Spalte.
      </p>
    </div>
  );
}

export function AvatarMenuDemo() {
  return (
    <div className="flex gap-6 items-start">
      <div className="relative">
        <p className="text-[10px] text-foreground-faint font-mono mb-2">theme=&quot;user&quot;</p>
        <AvatarMenu username="demo" settingsHref="#" theme="user" version="3.0.0" />
      </div>
      <div className="relative">
        <p className="text-[10px] text-foreground-faint font-mono mb-2">theme=&quot;admin&quot;</p>
        <AvatarMenu username="demo" settingsHref="#" theme="admin" version="3.0.0" />
      </div>
    </div>
  );
}

export function LocaleSwitcherDemo() {
  return <LocaleSwitcher current="de" />;
}

export function UserContextBarDemo() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border">
      <UserContextBar
        userId="u1"
        username="alice"
        currentStatus="VERSCHLUSS"
        since={new Date(Date.now() - 3 * 24 * 3600_000).toISOString()}
        users={MOCK_USERS}
      />
    </div>
  );
}

export function UserSubNavDemo() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border">
      <UserSubNav userId="demo-id" />
    </div>
  );
}

// ── Utility / System (statische Nachbauten) ───

export function InstallBannerMockDemo() {
  return (
    <div className="relative rounded-xl overflow-hidden">
      {/* Static rebuild of InstallBanner Android variant */}
      <div className="bg-foreground text-background rounded-xl shadow-xl p-4 flex items-start gap-3">
        <div className="flex-1">
          <p className="font-semibold text-sm">App installieren</p>
          <p className="text-xs opacity-70 mt-0.5">Zum Homescreen hinzufügen für schnelleren Zugriff.</p>
        </div>
        <button className="flex items-center gap-1.5 bg-[var(--color-inspect)] text-white text-xs font-semibold px-3 py-2 rounded-lg flex-shrink-0">
          <Download size={14} />
          Installieren
        </button>
        <button className="opacity-50 flex-shrink-0 mt-0.5">
          <X size={16} />
        </button>
      </div>
      <p className="text-[10px] text-foreground-faint mt-2">
        Statischer Nachbau — echte Komponente erkennt Plattform und nutzt localStorage.
      </p>
    </div>
  );
}

export function VersionCheckerMockDemo() {
  return (
    <div className="relative rounded-xl overflow-hidden">
      {/* Static rebuild of VersionChecker "outdated" state */}
      <div className="bg-gray-900 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl">
        <RefreshCw size={18} className="flex-shrink-0 text-gray-300 animate-spin" style={{ animationDuration: "2s" }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Neue Version verfügbar</p>
          <p className="text-xs text-gray-400">Seite neu laden für Update</p>
        </div>
        <button className="flex-shrink-0 bg-white text-gray-900 text-xs font-bold px-3 py-1.5 rounded-xl">
          Aktualisieren
        </button>
      </div>
      <p className="text-[10px] text-foreground-faint mt-2">
        Statischer Nachbau — echte Komponente pollt /api/version alle 5 Min.
      </p>
    </div>
  );
}

export function PushManagerMockDemo() {
  return (
    <div>
      <Toggle
        label="Push-Benachrichtigungen"
        description="Benötigt Service Worker und Notification-Berechtigung"
        checked={false}
        disabled
        onChange={() => {}}
      />
      <p className="text-[10px] text-foreground-faint mt-2">
        Statischer Nachbau — echte Komponente prüft Browser-Support und Berechtigung.
      </p>
    </div>
  );
}

export function LaufendeSessionCardMockDemo() {
  const sessionSince = new Date(Date.now() - 3 * 24 * 3600_000 - 14 * 3600_000).toISOString();

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-surface rounded-2xl overflow-hidden shadow-card border border-border">
        {/* ── Green status header ── */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-500 text-white px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10 mt-0.5">
              <Lock size={24} />
            </div>
            <div className="flex-1 min-w-0">
              {/* Mobile: stacked */}
              <div className="sm:hidden">
                <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">Laufende Session</p>
                <p className="text-2xl font-bold leading-tight">Verschlossen</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-xs font-semibold uppercase tracking-widest opacity-60">Dauer:</span>
                  <span className="text-xl font-bold tabular-nums">
                    <SessionDurationBadge since={sessionSince} pausedMs={0} />
                  </span>
                </div>
              </div>
              {/* Desktop: side by side */}
              <div className="hidden sm:flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">Laufende Session</p>
                  <p className="text-2xl font-bold">Verschlossen</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">Dauer</p>
                  <p className="text-3xl font-bold tabular-nums leading-tight">
                    <SessionDurationBadge since={sessionSince} pausedMs={0} />
                  </p>
                </div>
              </div>
              <p className="text-xs opacity-60 mt-1">Seit 30.03.2026, 08:15</p>
            </div>
          </div>

          {/* ── Trainingsvorgaben ── */}
          <div className="mt-4 pt-3 border-t border-white/20 flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100/70 mb-1">Trainingsvorgaben</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/70 w-12 shrink-0">Tag</span>
              <div className="flex-1 bg-white/15 rounded-full h-1.5 overflow-hidden">
                <div className="h-1.5 rounded-full bg-white" style={{ width: "100%" }} />
              </div>
              <span className="text-xs text-white/60 w-16 text-right shrink-0">14.2h / 12h</span>
              <span className="text-xs font-semibold text-white w-9 text-right shrink-0">100%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/70 w-12 shrink-0">Woche</span>
              <div className="flex-1 bg-white/15 rounded-full h-1.5 overflow-hidden">
                <div className="h-1.5 rounded-full bg-white/70" style={{ width: "72%" }} />
              </div>
              <span className="text-xs text-white/60 w-16 text-right shrink-0">43.2h / 60h</span>
              <span className="text-xs font-semibold text-white w-9 text-right shrink-0">72%</span>
            </div>
          </div>
        </div>

        {/* ── Timeline: echte SessionEventRow-Komponenten ── */}
        <div className="divide-y divide-border-subtle">
          {/* Verschluss (Lock entry) */}
          <SessionEventRow
            icon={<Lock size={18} className="text-lock" />}
            ev={{
              type: "verschluss",
              dateStr: "30.03.2026",
              timeStr: "08:15",
              imageUrl: null,
              exifStr: null,
              note: "Siegel #48291",
              entryId: "demo-v",
              captureHref: null,
              deadlineStr: null,
              isOverdue: false,
              kontrolleCode: null,
              kontrolleKommentar: null,
              kombiniertePillLabel: null,
              kombiniertePillCls: null,
              orgasmusArt: null,
            }}
          />
          {/* Kontrolle — erfüllt + KI-verifiziert */}
          <SessionEventRow
            icon={<CheckCircle2 size={18} className="text-[var(--color-inspect)]" />}
            ev={{
              type: "kontrolle",
              dateStr: "31.03.2026",
              timeStr: "14:30",
              imageUrl: null,
              exifStr: null,
              note: "Code verifiziert",
              entryId: "demo-k1",
              captureHref: null,
              deadlineStr: "31.03.2026, 18:15",
              isOverdue: false,
              kontrolleCode: "73519",
              kontrolleKommentar: null,
              kombiniertePillLabel: "Selbstkontrolle – Verifiziert",
              kombiniertePillCls: "bg-ok-bg text-ok-text border border-ok-border",
              orgasmusArt: null,
            }}
          />
          {/* Kontrolle — offen (noch nicht erfasst) → Banner-Stil mit CaptureButton */}
          <SessionEventRow
            icon={<CheckCircle2 size={18} className="text-[var(--color-inspect)]" />}
            ev={{
              type: "kontrolle",
              dateStr: "02.04.2026",
              timeStr: "10:00",
              imageUrl: null,
              exifStr: null,
              note: null,
              entryId: null,
              captureHref: "#",
              deadlineStr: "02.04.2026, 14:00",
              isOverdue: false,
              kontrolleCode: "90811",
              kontrolleKommentar: "Bitte Siegel prüfen",
              kombiniertePillLabel: null,
              kombiniertePillCls: null,
              orgasmusArt: null,
            }}
          />
          {/* Reinigung (Unterbrechung) */}
          <SessionEventRow
            icon={<LockOpen size={18} className="text-[var(--color-unlock)]" />}
            ev={{
              type: "reinigung",
              dateStr: "01.04.2026",
              timeStr: "07:00",
              imageUrl: null,
              exifStr: null,
              note: null,
              entryId: "demo-r",
              captureHref: null,
              deadlineStr: null,
              isOverdue: false,
              kontrolleCode: null,
              kontrolleKommentar: null,
              kombiniertePillLabel: null,
              kombiniertePillCls: null,
              orgasmusArt: null,
              pauseDurationStr: "15 Min. Pause",
            }}
          />
          {/* Orgasmus */}
          <SessionEventRow
            icon={<Droplets size={18} className="text-[var(--color-orgasm)]" />}
            ev={{
              type: "orgasmus",
              dateStr: "02.04.2026",
              timeStr: "22:30",
              imageUrl: null,
              exifStr: null,
              note: "Erlaubt",
              entryId: "demo-o",
              captureHref: null,
              deadlineStr: null,
              isOverdue: false,
              kontrolleCode: null,
              kontrolleKommentar: null,
              kombiniertePillLabel: null,
              kombiniertePillCls: null,
              orgasmusArt: "ruinierter Orgasmus",
            }}
          />
        </div>

        {/* ── Sperrzeit footer ── */}
        <div className="bg-sperrzeit-bg border-t border-sperrzeit-border px-5 py-3 flex items-center gap-2 rounded-b-2xl">
          <Lock size={13} className="text-sperrzeit shrink-0" />
          <span className="text-sm font-semibold text-sperrzeit-text">
            Verschlossen bis 04.04.2026, 09:00
          </span>
          <span className="text-xs text-sperrzeit truncate">· Wochenend-Sperre</span>
        </div>
      </div>
      <p className="text-[10px] text-foreground-faint">
        Nachbau mit echten Sub-Komponenten (SessionDurationBadge, SessionEventRow). Header + ProgressBar + Sperrzeit-Footer sind statisch (echte Komponente ist async Server Component).
      </p>
    </div>
  );
}

export function AdminFABMockDemo() {
  return (
    <div className="flex flex-col items-start gap-3">
      {/* Static rebuild of AdminFAB button */}
      <div className="flex items-center gap-2">
        <button className="w-14 h-14 rounded-full bg-[var(--btn-primary-bg)] text-white flex items-center justify-center shadow-lg">
          <Plus size={24} />
        </button>
        <span className="text-xs text-foreground-faint">FAB → User-Picker Sheet</span>
      </div>
      {/* Static user list example */}
      <div className="bg-surface rounded-xl border border-border p-3 w-full max-w-xs">
        {MOCK_USERS.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-raised">
            {u.isLocked ? (
              <Lock size={14} className="text-lock flex-shrink-0" />
            ) : (
              <LockOpen size={14} className="text-unlock flex-shrink-0" />
            )}
            <span className="text-sm font-medium text-foreground">{u.username}</span>
            <ChevronRight size={14} className="text-foreground-faint ml-auto" />
          </div>
        ))}
      </div>
      <p className="text-[10px] text-foreground-faint">
        Statischer Nachbau — echte Komponente fetcht /api/admin/users.
      </p>
    </div>
  );
}
