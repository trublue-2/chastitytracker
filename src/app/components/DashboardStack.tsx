"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import Button from "@/app/components/Button";
import DashboardBlock from "@/app/components/DashboardBlock";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import type { BlockSurface } from "@/lib/dashboardBlockRegistry";

/** Ein Block, wie ihn der Bearbeiten-Modus kennt — Beschriftung und Zustand, KEIN Inhalt. */
export interface StackBlockMeta {
  id: string;
  label: string;
  hidden: boolean;
  /** Lässt sich nicht ausblenden (trägt den Bearbeiten-Knopf). */
  alwaysOn?: boolean;
}

/**
 * Der Block-Stapel einer Oberfläche samt Bearbeiten-Modus.
 *
 * **Der Modus zeigt Zeilen, nicht Blöcke** (Variante B). Der Grund ist das Handy: fünfzehn
 * ausgewachsene Blöcke zu sortieren heisst, den Bildschirm dreimal zu durchwandern, um einen nach
 * oben zu schieben. Als Liste liegt das ganze Layout auf einem Schirm und ein Block wandert mit
 * zwei Antippern.
 *
 * Daraus folgt eine angenehme Eigenschaft: **im Bearbeiten-Modus braucht niemand die Inhalte.**
 * Der Server rendert deshalb nur die SICHTBAREN Blöcke und schickt sie als `children`; die
 * ausgeblendeten kosten weder Rechenzeit noch Übertragung. Nach dem Speichern lädt die Seite neu
 * und der Server stellt den neuen Stand zusammen.
 *
 * Kein Drag-and-drop: auf dem Handy fummelig, mit Tastatur oder Screenreader kaum bedienbar.
 * Pfeiltasten sind beides.
 */
export default function DashboardStack({
  surface,
  meta,
  children,
}: {
  surface: BlockSurface;
  /** ALLE Blöcke in wirksamer Reihenfolge — auch die ausgeblendeten, sonst liessen sie sich nie zurückholen. */
  meta: StackBlockMeta[];
  /** Die gerenderten SICHTBAREN Blöcke, in derselben Reihenfolge wie `meta` sie sichtbar führt. */
  children: ReactNode;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const apiError = useApiError();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(meta);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const hiddenCount = meta.filter((b) => b.hidden).length;

  // Beide Handler nehmen die Aktualisierungs-Form, nicht `draft` aus dem Closure. Sonst gehen
  // zwei Klicks im selben React-Batch verloren: der zweite rechnet auf dem Stand VOR dem ersten
  // und überschreibt ihn. Beim Sortieren tippt man genau so — zweimal schnell auf denselben Pfeil.
  function move(index: number, delta: number) {
    setDraft((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  function toggle(index: number) {
    setDraft((prev) => prev.map((b, i) => (i === index && !b.alwaysOn ? { ...b, hidden: !b.hidden } : b)));
  }

  async function save() {
    setError(null);
    try {
      const res = await fetch("/api/settings/dashboard-layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboardLayout: {
            [surface]: {
              hidden: draft.filter((b) => b.hidden).map((b) => b.id),
              order: draft.map((b) => b.id),
            },
          },
        }),
      });
      if (!res.ok) {
        setError(apiError(await parseApiErrorCode(res)));
        return;
      }
      setEditing(false);
      // Der Server stellt den Stapel neu zusammen — er allein kennt die Inhalte der Blöcke, die
      // gerade wieder eingeblendet wurden.
      startSaving(() => router.refresh());
    } catch {
      setError(apiError(null));
    }
  }

  if (editing) {
    return (
      <DashboardBlock>
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">{t("editLayoutTitle")}</p>
            <Button variant="secondary" onClick={save} loading={saving}>{t("editLayoutDone")}</Button>
          </div>

          {error && <p className="px-4 py-3 text-sm text-warn bg-warn-bg">{error}</p>}

          <ul className="divide-y divide-border-subtle">
            {draft.map((b, i) => (
              <li key={b.id} className={`flex items-center gap-2 px-3 py-2.5 ${b.hidden ? "opacity-50" : ""}`}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  disabled={b.alwaysOn}
                  aria-label={b.hidden ? t("editLayoutShow", { name: b.label }) : t("editLayoutHide", { name: b.label })}
                  aria-pressed={!b.hidden}
                  className="size-9 shrink-0 rounded-lg flex items-center justify-center text-foreground-muted hover:bg-surface-raised transition disabled:opacity-40"
                >
                  {b.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <span className="flex-1 min-w-0 text-sm text-foreground truncate">{b.label}</span>
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={t("editLayoutUp", { name: b.label })}
                  className="size-9 shrink-0 rounded-lg flex items-center justify-center text-foreground-muted hover:bg-surface-raised transition disabled:opacity-30"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === draft.length - 1}
                  aria-label={t("editLayoutDown", { name: b.label })}
                  className="size-9 shrink-0 rounded-lg flex items-center justify-center text-foreground-muted hover:bg-surface-raised transition disabled:opacity-30"
                >
                  <ChevronDown size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DashboardBlock>
    );
  }

  return (
    <>
      {children}
      {/* Die leise Erinnerung. Ohne sie ist ein weggeschalteter Block nach zwei Wochen vergessen —
          und das wiegt schwer, seit auch Blöcke mit Frist abschaltbar sind. */}
      <DashboardBlock>
        <button
          type="button"
          onClick={() => { setDraft(meta); setEditing(true); }}
          className="w-full flex items-center gap-2 px-1 py-2 text-xs text-foreground-faint hover:text-foreground-muted transition"
        >
          <SlidersHorizontal size={14} />
          <span>{hiddenCount > 0 ? t("layoutHiddenCount", { count: hiddenCount }) : t("editLayout")}</span>
        </button>
      </DashboardBlock>
    </>
  );
}
