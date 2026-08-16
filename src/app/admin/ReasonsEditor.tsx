"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import ReorderButtons from "@/app/components/ReorderButtons";
import RemoveRowButton from "@/app/components/RemoveRowButton";
import FormError from "@/app/components/FormError";
import { swapAt } from "@/lib/utils";
import type { ReasonEntry } from "@/lib/reasonsService";

/** Zeile im Editor: ReasonEntry plus optionaler stabiler Client-Key für noch nicht gespeicherte Zeilen. */
type EditorRow = ReasonEntry & { _k?: string };

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
  const tc = useTranslations("common");
  const router = useRouter();
  const [rows, setRows] = useState<EditorRow[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sendbare Form: leere Zeilen raus, Labels getrimmt. Einzige Quelle für PATCH-Body UND Dirty-Check.
  const toSendable = (rs: EditorRow[]) =>
    rs.filter((r) => r.code || (r.label ?? "").trim()).map((r) => ({ code: r.code, label: (r.label ?? "").trim() }));
  const serialize = (rs: EditorRow[]) => JSON.stringify(toSendable(rs));
  const savedRef = useRef(serialize(initial)); // Stand der letzten gespeicherten Zeilen
  const rowsRef = useRef(rows);                 // stets aktuelle Zeilen → kein Stale-Closure beim onBlur
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const savingRef = useRef(false);              // synchroner In-Flight-Guard gegen paralleles/re-entrantes Speichern
  const keyCounter = useRef(0);

  async function commit(next: EditorRow[]) {
    if (savingRef.current) return; // ein Speichern zur Zeit — verhindert Doppel-PATCH / Lost-Update
    savingRef.current = true;
    setRows(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [configKey]: toSendable(next) }),
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      if (Array.isArray(data.config)) {
        setRows(data.config as EditorRow[]);
        savedRef.current = serialize(data.config as EditorRow[]);
      }
    } catch {
      setError(tc("savingError"));
    } finally {
      savingRef.current = false;
      setSaving(false);
      router.refresh();
    }
  }

  // Nur speichern, wenn sich gegenüber dem letzten Stand wirklich etwas geändert hat — aus den
  // AKTUELLEN Zeilen (rowsRef), nicht dem Closure-Stand, damit kein Tastendruck bei Blur verlorengeht.
  function saveIfDirty() {
    const cur = rowsRef.current;
    if (serialize(cur) !== savedRef.current) void commit(cur);
  }

  function setLabel(i: number, label: string) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, label } : r)));
  }
  function move(i: number, dir: -1 | 1) {
    const cur = rowsRef.current; // aktuelle Zeilen (inkl. evtl. ungespeicherter Tastatureingabe)
    const next = swapAt(cur, i, i + dir);
    if (next === cur) return; // am Rand: nichts zu speichern
    void commit(next);
  }

  const inputCls = "flex-1 min-w-0 border border-border rounded-lg px-2 py-1.5 text-sm text-foreground bg-surface-raised focus:outline-none focus:ring-2 focus:ring-foreground/20";

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const locked = !!protectedCode && r.code === protectedCode;
        return (
          <div key={r.code || r._k} className="flex items-center gap-1.5">
            <ReorderButtons
              index={i}
              count={rows.length}
              onMove={(dir) => move(i, dir)}
              upLabel={t("reasonMoveUp")}
              downLabel={t("reasonMoveDown")}
              disabled={saving}
            />
            <input
              type="text"
              value={r.label ?? ""}
              placeholder={builtinLabels[r.code] ?? t("reasonPlaceholder")}
              maxLength={40}
              disabled={saving}
              onChange={(e) => setLabel(i, e.target.value)}
              onBlur={saveIfDirty}
              className={inputCls}
            />
            {locked ? (
              <span className="p-1 text-foreground-faint/50 shrink-0" title={t("reasonLockedHint")} aria-hidden>
                <Trash2 size={16} />
              </span>
            ) : (
              <RemoveRowButton
                onClick={() => void commit(rowsRef.current.filter((_, j) => j !== i))}
                disabled={saving}
                ariaLabel={t("reasonRemove")}
                icon={<Trash2 size={16} />}
              />
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { code: "", label: "", _k: `n${keyCounter.current++}` }])}
        disabled={saving || rows.length >= 12}
        className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground disabled:opacity-50 w-fit mt-1"
      >
        <Plus size={14} /> {t("reasonAdd")}
      </button>
      <FormError message={error} />
    </div>
  );
}
