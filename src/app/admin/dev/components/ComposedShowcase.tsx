"use client";

import { useState } from "react";
import { Plus, Download, X, RefreshCw, ChevronLeft, ArrowLeftRight, ChevronRight, CheckCircle2, Droplets } from "lucide-react";

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
import type { SessionEventData } from "@/app/dashboard/SessionEventRow";
import SessionEventRow from "@/app/dashboard/SessionEventRow";
import SessionDurationBadge from "@/app/dashboard/SessionDurationBadge";
import Section from "@/app/components/Section";
import StateHero from "@/app/components/StateHero";
import GoalProgressRows from "@/app/components/GoalProgressRows";
import { LockClosedIcon, LockOpenIcon } from "@/app/components/lockIcons";

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

/**
 * Vorgabewerte einer Demo-Zeile: alles auf „trifft nicht zu".
 *
 * Nur für die Schaufenster-Daten. Die ECHTEN Bauer (`SessionList`, `LaufendeSessionCard`) schreiben
 * jedes Feld bewusst aus — dort ist genau das der Zweck der Pflichtfelder (Issue #54). Hier geht es
 * nur darum, dass eine neue Spalte am Typ nicht elf Demo-Blöcke bricht; der Compiler zeigt sie
 * trotzdem an EINER Stelle an.
 */
const demoEvent = {
  timeIso: undefined, codeImageUrl: null, codeRevealed: undefined, captureDisabled: false,
  verifyFailure: null, pauseDurationStr: null, timeCorrected: false, timeCorrectedSystemStr: null,
  deviceName: null, showDevice: false, keyDetected: null, keyProofSource: null, boxImageUrl: null,
} satisfies Partial<SessionEventData>;

export function SessionEventRowDemo() {
  return (
    <div className="bg-surface rounded-2xl border border-border overflow-hidden divide-y divide-border-subtle">
      <p className="px-5 pt-3 text-[10px] text-foreground-faint font-mono">type=&quot;verschluss&quot;</p>
      <SessionEventRow
        icon={<LockClosedIcon size={18} className="text-lock" />}
        ev={{
          ...demoEvent,
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
          ...demoEvent,
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
          ...demoEvent,
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
          ...demoEvent,
          type: "kontrolle", dateStr: "01.04.2026", timeStr: "20:00",
          imageUrl: null, exifStr: null, note: null, entryId: null,
          captureHref: "#", deadlineStr: "02.04.2026, 00:00", isOverdue: true,
          kontrolleCode: "55123", kontrolleKommentar: "Dringend!",
          kombiniertePillLabel: null, kombiniertePillCls: null, orgasmusArt: null,
        }}
      />
      <p className="px-5 pt-3 text-[10px] text-foreground-faint font-mono">type=&quot;reinigung&quot; — mit Pausendauer</p>
      <SessionEventRow
        icon={<LockOpenIcon size={18} className="text-[var(--color-unlock)]" />}
        ev={{
          ...demoEvent,
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
          ...demoEvent,
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
        isGlobalAdmin={true}
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
        <button className="flex items-center gap-1.5 bg-[var(--color-inspect)] text-btn-primary-text text-xs font-semibold px-3 py-2 rounded-lg flex-shrink-0">
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

export function HeartbeatMockDemo() {
  return (
    <div className="relative rounded-xl overflow-hidden">
      {/* Static rebuild of Heartbeat "outdated" state */}
      <div className="bg-surface-raised text-foreground border border-border rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl">
        <RefreshCw size={18} className="flex-shrink-0 text-foreground-muted animate-spin" style={{ animationDuration: "2s" }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Neue Version verfügbar</p>
          <p className="text-xs text-foreground-faint">Seite neu laden für Update</p>
        </div>
        <Button size="sm" className="flex-shrink-0">
          Aktualisieren
        </Button>
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
      <div className="flex flex-col gap-4">
        {/* Die ECHTEN Bauteile, nicht ihr Nachbau. Hier stand zuerst der alte Verlaufskasten und
            danach eine Handkopie der neuen Figur — beides falsch: eine Schau, die etwas anderes
            zeigt als das Produkt, ist die Vorlage, von der wieder jemand abschreibt. Die Handkopie
            lief prompt schon auseinander (zwei Füllstufen statt drei, `--wear-4` fehlte).

            `LaufendeSessionCard` selbst geht hier nicht — sie ist eine Server-Komponente, die
            Schau ist `"use client"`. `StateHero` und `GoalProgressRows` sind es nicht und tragen
            genau die Figuren, um die es geht. */}
        <StateHero
          tone="lock"
          word="Verschlossen"
          icon={<LockClosedIcon size={15} strokeWidth={2.2} className="shrink-0" />}
          value={<SessionDurationBadge since={sessionSince} pausedMs={0} />}
          footnote="Seit 30.03.2026, 08:15"
        />

        <Section title="KG-Ziele">
          <GoalProgressRows
            actual={{ day: 14.2, week: 43.2, month: 180, year: 900 }}
            targetH={{ day: 12, week: 60, month: null, year: null }}
          />
        </Section>

        {/* ── Timeline: echte SessionEventRow-Komponenten ── */}
        <div className="divide-y divide-border-subtle">
          {/* Verschluss (LockClosedIcon entry) */}
          <SessionEventRow
            icon={<LockClosedIcon size={18} className="text-lock" />}
            ev={{
              ...demoEvent,
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
              ...demoEvent,
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
              ...demoEvent,
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
            icon={<LockOpenIcon size={18} className="text-[var(--color-unlock)]" />}
            ev={{
              ...demoEvent,
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
              ...demoEvent,
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
        {/* Ohne `rounded-b-2xl` und ohne `border-t`: die Karte, an deren Unterkante dieser Fuss
            sass, gibt es nicht mehr. Er schwebte danach als Streifen mit abgerundeten UNTEREN Ecken
            auf dem Seitengrund. */}
        <div className="bg-sperrzeit-bg px-5 py-3 flex items-center gap-2 rounded-xl">
          <LockClosedIcon size={13} className="text-sperrzeit shrink-0" />
          <span className="text-sm font-semibold text-sperrzeit-text">
            Verschlossen bis 04.04.2026, 09:00
          </span>
          <span className="text-xs text-sperrzeit truncate">· Wochenend-Sperre</span>
        </div>
      </div>
      <p className="text-[10px] text-foreground-faint">
        Echte Bauteile: StateHero, GoalProgressRows, SessionDurationBadge, SessionEventRow. Nur der Sperrzeit-Fuss ist statisch — die vollständige `LaufendeSessionCard` ist eine async Server-Komponente und lässt sich hier nicht rendern.
      </p>
    </div>
  );
}

export function AdminFABMockDemo() {
  return (
    <div className="flex flex-col items-start gap-3">
      {/* Static rebuild of AdminFAB button */}
      <div className="flex items-center gap-2">
        <button className="w-14 h-14 rounded-full bg-btn-primary text-btn-primary-text flex items-center justify-center shadow-lg">
          <Plus size={24} />
        </button>
        <span className="text-xs text-foreground-faint">FAB → User-Picker Sheet</span>
      </div>
      {/* Static user list example */}
      <div className="bg-surface rounded-xl border border-border p-3 w-full max-w-xs">
        {MOCK_USERS.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-raised">
            {u.isLocked ? (
              <LockClosedIcon size={14} className="text-lock flex-shrink-0" />
            ) : (
              <LockOpenIcon size={14} className="text-unlock flex-shrink-0" />
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
