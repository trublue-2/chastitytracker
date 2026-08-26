"use client";

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import Badge from "@/app/components/Badge";
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
  /** Lässt sich nicht ausblenden — entweder weil der Block das Gerüst trägt (den Bearbeiten-Knopf)
   *  oder weil er eine FRIST zeigt. Wegschaltbare Fristen sind der Fehler aus Issue #70: der Block
   *  steht meistens leer, wer ihn deshalb einmal ausblendet, sieht die überfällige Kontrolle nie
   *  wieder und erwirbt Strafen für etwas, das ihm niemand angezeigt hat. */
  alwaysOn?: boolean;
}

/**
 * Reihenfolge UND Sichtbarkeit als eine vergleichbare Zeichenkette.
 *
 * Der Vergleich darf NICHT an der Array-Identität hängen: `move()` und `toggle()` bauen bei jedem
 * Klick ein neues Array mit neuen Objekten, auch wenn zwei Klicks einander aufheben und am Ende
 * wieder genau der Ausgangsstand dasteht. Wer Identitäten vergleicht, hielte das für eine Änderung.
 */
function layoutSignature(blocks: StackBlockMeta[]): string {
  return blocks.map((b) => `${b.id}:${b.hidden ? "0" : "1"}`).join(",");
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
 *
 * **Der Modus hat drei Ausgänge, und nur einer schreibt.** „Fertig" speichert, „Abbrechen" (und
 * Escape) verwirft, „Auf Standard zurücksetzen" löscht die gespeicherte Anordnung ganz. Das ist
 * kein Komfort, sondern nötig: `save()` schreibt immer die VOLLE Reihenfolge, ein Nutzer, der den
 * Modus nur neugierig öffnet und bestätigt, friert damit sonst die heutige Voreinstellung für
 * immer ein — eine später verbesserte Standard-Reihenfolge erreichte ihn nie wieder.
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
  const tc = useTranslations("common");
  const router = useRouter();
  const apiError = useApiError();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(meta);
  /** Der Stand beim BETRETEN des Modus — das Mass dafür, ob es überhaupt etwas zu schreiben gibt. */
  const [baseline, setBaseline] = useState(() => layoutSignature(meta));
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

  function openEditor() {
    setDraft(meta);
    setBaseline(layoutSignature(meta));
    setError(null);
    setEditing(true);
  }

  // `useCallback`, weil die Escape-Taste denselben Weg nimmt und der Effekt sonst bei jedem
  // Tastendruck neu anhängen müsste.
  const cancel = useCallback(() => {
    setDraft(meta);
    setError(null);
    setEditing(false);
  }, [meta]);

  // Escape ist der Ausgang, den jeder blind versucht. Tut er nichts, bleibt als einziger Weg der,
  // der schreibt — und ein blosser Versuch wird verbindlich.
  useEffect(() => {
    if (!editing) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing, cancel]);

  /** Der eine Schreibweg — „Fertig" und „Zurücksetzen" unterscheiden sich nur in der Nutzlast. */
  async function patchLayout(layout: { hidden: string[]; order: string[] }) {
    setError(null);
    try {
      const res = await fetch("/api/settings/dashboard-layout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashboardLayout: { [surface]: layout } }),
      });
      if (!res.ok) {
        setError(apiError(await parseApiErrorCode(res)));
        return;
      }
      // Erst neu laden, DANN schliessen. Andersherum war `saving` nur wahr, während der Editor
      // schon zu war — der Ladehinweis auf „Fertig" also unerreichbar, und in dem Fenster zeigte
      // der Stapel weiter die ALTE Reihenfolge. Wer in diesem Moment noch einmal „Dashboard
      // anpassen" tippte, bekam den veralteten `meta`-Stand als Entwurf UND als Vergleichsmass:
      // seine Änderung sah aus wie zurückgenommen, und ein zweites „Fertig" fiel still durch die
      // Gleichstands-Prüfung.
      startSaving(() => {
        router.refresh();
        setEditing(false);
      });
    } catch {
      setError(apiError(null));
    }
  }

  async function save() {
    // Wer nichts angefasst hat, schreibt auch nichts. Sonst würde allein das Öffnen und Bestätigen
    // die heutige Standard-Reihenfolge dauerhaft festschreiben (siehe Kopf-Kommentar).
    if (layoutSignature(draft) === baseline) {
      cancel();
      return;
    }
    await patchLayout({
      hidden: draft.filter((b) => b.hidden).map((b) => b.id),
      order: draft.map((b) => b.id),
    });
  }

  /** Leere Listen heissen „keine eigene Anordnung" — der Nutzer folgt danach wieder der Vorgabe. */
  async function resetToDefault() {
    await patchLayout({ hidden: [], order: [] });
  }

  if (editing) {
    return (
      <DashboardBlock>
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground truncate">{t("editLayoutTitle")}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="ghost" size="sm" onClick={cancel}>{tc("cancel")}</Button>
              <Button variant="secondary" size="sm" onClick={save} loading={saving}>{t("editLayoutDone")}</Button>
            </div>
          </div>

          {error && <p className="px-4 py-3 text-sm text-warn bg-warn-bg">{error}</p>}

          <ul className="divide-y divide-border-subtle">
            {draft.map((b, i) => (
              <li key={b.id} className={`flex items-center gap-2 px-3 py-2.5 ${b.hidden ? "opacity-50" : ""}`}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  disabled={b.alwaysOn}
                  // Ein gesperrter Schalter muss sagen, warum. Blöcke mit Frist bleiben sichtbar
                  // (`alwaysOn`) — sonst verschwände die überfällige Kontrolle samt Knopf, und der
                  // Träger erwürbe Strafen für etwas, das ihm nie angezeigt wurde. Ohne diesen Satz
                  // steht der Schalter einfach tot da und liest sich als Fehler.
                  aria-label={b.hidden ? t("editLayoutShow", { name: b.label }) : t("editLayoutHide", { name: b.label })}
                  aria-pressed={!b.hidden}
                  className="size-9 shrink-0 rounded-lg flex items-center justify-center text-foreground-muted hover:bg-surface-raised transition disabled:opacity-40"
                >
                  {b.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <span className="flex-1 min-w-0 text-sm text-foreground truncate">{b.label}</span>
                {b.alwaysOn && <Badge size="sm" label={t("editLayoutLocked")} />}
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

          {/* Leise am Fuss: der Weg zurück zur Vorgabe ist selten nötig und soll die beiden
              Ausgänge oben nicht überstimmen. */}
          <button
            type="button"
            onClick={resetToDefault}
            className="w-full px-4 py-3 text-left text-xs text-foreground-faint hover:text-foreground-muted border-t border-border-subtle transition"
          >
            {t("editLayoutReset")}
          </button>
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
          onClick={openEditor}
          className="w-full flex items-center gap-2 px-1 py-2 text-xs text-foreground-faint hover:text-foreground-muted transition"
        >
          <SlidersHorizontal size={14} />
          <span>{hiddenCount > 0 ? t("layoutHiddenCount", { count: hiddenCount }) : t("editLayout")}</span>
        </button>
      </DashboardBlock>
    </>
  );
}
