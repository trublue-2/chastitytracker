"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { ReasonEntry } from "@/lib/reasonsService";

/**
 * Admin-Editor für eine anpassbare Auswahlliste (Orgasmus-Arten ODER Öffnungsgründe) eines Subs.
 * Zeilen: umbenennen (Label-Override; leer = eingebautes i18n-Label als Placeholder), hinzufügen,
 * entfernen, sortieren. Der geschützte Code (`protectedCode`, = REINIGUNG bei Öffnungsgründen) kann
 * nicht entfernt, nur umbenannt werden. Nach jedem Speichern wird der State aus der server-
 * normalisierten Antwort re-seedet (u.a. frisch vergebene Custom-Codes → keine Duplikate).
 */
export default function ReasonsEditor({
  userId,
  configKey,
  initial,
  builtinLabels,
  protectedCode,
}: {
  userId: string;
  configKey: "orgasmusArtenConfig" | "oeffnenGruendeConfig";
  initial: ReasonEntry[];
  builtinLabels: Record<string, string>;
  protectedCode?: string;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [rows, setRows] = useState<ReasonEntry[]>(initial);
  const [saving, setSaving] = useState(false);

  async function save(next: ReasonEntry[]) {
    setRows(next);
    setSaving(true);
    // Brand-neue, leere Zeilen (kein Code, kein Label) nicht senden.
    const toSend = next
      .filter((r) => !(!r.code && !(r.label ?? "").trim()))
      .map((r) => ({ code: r.code, label: (r.label ?? "").trim() }));
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [configKey]: toSend }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.config)) setRows(data.config as ReasonEntry[]);
      }
    } finally {
      setSaving(false);
      router.refresh();
    }
  }

  function setLabel(i: number, label: string) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, label } : r)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  }

  const inputCls = "flex-1 min-w-0 border border-border rounded-lg px-2 py-1.5 text-sm text-foreground bg-surface-raised focus:outline-none focus:ring-2 focus:ring-foreground/20";

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const locked = !!protectedCode && r.code === protectedCode;
        return (
          <div key={r.code || `new-${i}`} className="flex items-center gap-1.5">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={saving || i === 0}
                aria-label={t("reasonMoveUp")} className="p-0.5 text-foreground-faint hover:text-foreground disabled:opacity-30">
                <ChevronUp size={14} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={saving || i === rows.length - 1}
                aria-label={t("reasonMoveDown")} className="p-0.5 text-foreground-faint hover:text-foreground disabled:opacity-30">
                <ChevronDown size={14} />
              </button>
            </div>
            <input
              type="text"
              value={r.label ?? ""}
              placeholder={builtinLabels[r.code] ?? t("reasonPlaceholder")}
              maxLength={40}
              disabled={saving}
              onChange={(e) => setLabel(i, e.target.value)}
              onBlur={() => save(rows)}
              className={inputCls}
            />
            {locked ? (
              <span className="p-1 text-foreground-faint/50 shrink-0" title={t("reasonLockedHint")} aria-hidden>
                <Trash2 size={16} />
              </span>
            ) : (
              <button type="button" onClick={() => save(rows.filter((_, j) => j !== i))} disabled={saving}
                aria-label={t("reasonRemove")} className="p-1 text-foreground-faint hover:text-warn disabled:opacity-50 shrink-0">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { code: "", label: "" }])}
        disabled={saving || rows.length >= 12}
        className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-50 w-fit mt-1"
      >
        <Plus size={14} /> {t("reasonAdd")}
      </button>
    </div>
  );
}
