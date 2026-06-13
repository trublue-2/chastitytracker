"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen, ClipboardCheck, Droplets, KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Sheet from "./Sheet";
import CategoryIconRender from "./CategoryIcon";
import { categoryStyle } from "@/lib/categoryConstants";

type BoxRow = {
  boxId: string;
  name: string;
  locked: boolean;
  lockUntil: string | null;
  simpleLock: boolean;
  keyholderLocked: boolean;
};

function boxStateLabel(b: BoxRow): string {
  if (b.keyholderLocked) return b.lockUntil ? `zu · Sperrzeit bis ${fmtTime(b.lockUntil)}` : "zu · Sperrzeit";
  if (b.lockUntil) return `zu · bis ${fmtTime(b.lockUntil)}`;
  if (b.simpleLock) return "zu · ohne Zeitlimit";
  return "zu";
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

export interface NewEntryCategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string;
  /** Set when an active wear-session exists in this category. Null otherwise. */
  activeDeviceName: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  isLocked: boolean;
  /** Non-KG categories with their active-session state. Empty/undefined when feature flag is off. */
  categoryRows?: NewEntryCategoryRow[];
}

export default function NewEntrySheet({ open, onClose, isLocked, categoryRows = [] }: Props) {
  const t = useTranslations("newEntry");
  const tw = useTranslations("wearForm");
  const router = useRouter();

  const [boxes, setBoxes] = useState<BoxRow[]>([]);
  const [boxBusy, setBoxBusy] = useState<string | null>(null);
  const [requested, setRequested] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    fetch("/api/box")
      .then((r) => (r.ok ? r.json() : []))
      .then(setBoxes)
      .catch(() => {});
  }, [open]);

  async function lockBox(boxId: string) {
    setBoxBusy(boxId);
    try {
      const r = await fetch("/api/box/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boxId, command: "lock" }),
      });
      if (r.ok) setRequested((s) => ({ ...s, [boxId]: true }));
    } finally {
      setBoxBusy(null);
    }
  }

  const options = [
    {
      type: "verschluss",
      icon: Lock,
      label: t("lock"),
      desc: t("lockSubtitle"),
      disabled: isLocked,
      disabledText: t("lockDisabled"),
      color: "text-lock",
      href: "/dashboard/new/verschluss",
    },
    {
      type: "oeffnen",
      icon: LockOpen,
      label: t("open"),
      desc: t("openSubtitle"),
      disabled: !isLocked,
      disabledText: t("openDisabled"),
      color: "text-unlock",
      href: "/dashboard/new/oeffnen",
    },
    {
      type: "pruefung",
      icon: ClipboardCheck,
      label: t("inspection"),
      desc: t("inspectionSubtitle"),
      disabled: false,
      color: "text-inspect",
      href: "/dashboard/new/pruefung",
    },
    {
      type: "orgasmus",
      icon: Droplets,
      label: t("orgasm"),
      desc: t("orgasmSubtitle"),
      disabled: false,
      color: "text-orgasm",
      href: "/dashboard/new/orgasmus",
    },
  ];

  function handleSelect(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("title")}>
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const Icon = opt.icon;
          if (opt.disabled) {
            return (
              <div
                key={opt.type}
                className="flex items-center gap-4 px-4 py-3.5 rounded-xl opacity-40 cursor-not-allowed"
              >
                <Icon size={22} className="text-foreground-faint shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-foreground-faint">{opt.disabledText ?? opt.desc}</p>
                </div>
              </div>
            );
          }

          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => handleSelect(opt.href)}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-background-subtle active:bg-background-subtle transition-colors text-left w-full"
            >
              <Icon size={22} className={`${opt.color} shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-foreground-muted">{opt.desc}</p>
              </div>
            </button>
          );
        })}

        {/* Per-Category wear actions (begin or end based on state). */}
        {categoryRows.map((c) => {
          const active = c.activeDeviceName !== null;
          const href = active
            ? `/dashboard/new/wear-end?category=${c.id}`
            : `/dashboard/new/wear-begin?category=${c.id}`;
          const desc = active
            ? `${tw("endShort")} · ${c.activeDeviceName}`
            : tw("titleBegin");
          const style = categoryStyle(c.color);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSelect(href)}
              className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-background-subtle active:bg-background-subtle transition-colors text-left w-full"
            >
              <span
                className="size-7 rounded-md flex items-center justify-center shrink-0"
                style={{ backgroundColor: style.backgroundColor, color: style.color }}
                aria-hidden
              >
                <CategoryIconRender name={c.icon} className="size-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{c.name}</p>
                <p className="text-xs text-foreground-muted truncate">{desc}</p>
              </div>
            </button>
          );
        })}

        {/* Heimdall-Box(en): zustands-bewusst — offen → verschliessen, zu → Status (öffnen folgt). */}
        {boxes.map((b) => {
          if (requested[b.boxId]) {
            return (
              <div key={b.boxId} className="flex items-center gap-4 px-4 py-3.5 rounded-xl opacity-60">
                <KeyRound size={22} className="text-foreground-faint shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{b.name}</p>
                  <p className="text-xs text-foreground-muted">Verschluss angefordert — schliesst beim nächsten Box-Sync</p>
                </div>
              </div>
            );
          }
          if (!b.locked) {
            return (
              <button
                key={b.boxId}
                type="button"
                onClick={() => lockBox(b.boxId)}
                disabled={boxBusy === b.boxId}
                className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-background-subtle active:bg-background-subtle transition-colors text-left w-full disabled:opacity-50"
              >
                {boxBusy === b.boxId ? (
                  <Loader2 size={22} className="text-lock shrink-0 animate-spin" />
                ) : (
                  <KeyRound size={22} className="text-lock shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{b.name} verschliessen</p>
                  <p className="text-xs text-foreground-muted">Schlüssel ist jetzt in der Box</p>
                </div>
              </button>
            );
          }
          return (
            <div key={b.boxId} className="flex items-center gap-4 px-4 py-3.5 rounded-xl opacity-50">
              <KeyRound size={22} className="text-foreground-faint shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{b.name}</p>
                <p className="text-xs text-foreground-faint">{boxStateLabel(b)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
