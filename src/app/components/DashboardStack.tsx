"use client";

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { swapAt } from "@/lib/utils";
import { metaRowButtonCls, metaRowChipCls, metaRowSlotCls } from "@/app/components/inputStyles";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, SlidersHorizontal, ChevronRight } from "lucide-react";
import { LockClosedIcon } from "@/app/components/lockIcons";
import ReorderButtons from "@/app/components/ReorderButtons";
import Button from "@/app/components/Button";
import DashboardBlock from "@/app/components/DashboardBlock";
import LiveStatus from "@/app/components/LiveStatus";
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
  /**
   * Die Zuklapp-VORGABE — `undefined` heisst „nicht zuklappbar", und nur dann fehlt der dritte
   * Schalter. Ein Feld statt zweier: `collapsible` daneben liesse den unmöglichen Zustand
   * „nicht zuklappbar, aber zugeklappt" zu.
   */
  collapsed?: boolean;
}

/**
 * Reihenfolge UND Sichtbarkeit als eine vergleichbare Zeichenkette.
 *
 * Der Vergleich darf NICHT an der Array-Identität hängen: `move()` und `toggle()` bauen bei jedem
 * Klick ein neues Array mit neuen Objekten, auch wenn zwei Klicks einander aufheben und am Ende
 * wieder genau der Ausgangsstand dasteht. Wer Identitäten vergleicht, hielte das für eine Änderung.
 */
function layoutSignature(blocks: StackBlockMeta[]): string {
  return blocks.map((b) => `${b.id}:${b.hidden ? "0" : "1"}${b.collapsed ? "c" : ""}`).join(",");
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
  /** Der zuletzt verschobene Block — allein für die Ansage an die Assistenztechnik. */
  const [movedId, setMovedId] = useState<string | null>(null);

  const hiddenCount = meta.filter((b) => b.hidden).length;

  // Das Sortieren ist eine rein optische Änderung: der Pfeil bleibt unter dem Finger, die Zeile
  // rutscht lautlos an ihm vorbei. Wer nicht sieht, sondern hört, bekam vom Verschieben gar nichts
  // mit — der Knopf meldete danach denselben Namen wie davor.
  //
  // ABGELEITET, nicht in einem Effekt gesetzt: der Satz ändert sich damit genau dann, wenn sich
  // Reihenfolge oder Ziel-Block ändern — also nach einer Handlung des Nutzers. Ein Takt, der die
  // Region von selbst neu beschriebe, unterbräche den Screenreader endlos (siehe `TimerDisplay`).
  const movedIndex = movedId === null ? -1 : draft.findIndex((b) => b.id === movedId);
  const movedAnnounce =
    movedIndex < 0
      ? ""
      : t("editLayoutMoved", { name: draft[movedIndex].label, position: movedIndex + 1, total: draft.length });

  // Beide Handler SCHREIBEN über die Aktualisierungs-Form, nicht über `draft` aus dem Closure.
  // Sonst gehen zwei Klicks im selben React-Batch verloren: der zweite rechnet auf dem Stand VOR
  // dem ersten und überschreibt ihn. Beim Sortieren tippt man genau so — zweimal schnell auf
  // denselben Pfeil. (Der Bereichs-Test in `move` liest `draft` bewusst doch aus dem Closure; er
  // entscheidet nur, ob überhaupt ANGESAGT wird, und der Aktualisierer prüft ohnehin noch einmal.)
  //
  // Der Block wird über seine ID angesprochen, nicht über den Listen-Index: der Index stammt aus
  // dem Render und ist nach dem ersten von zwei schnellen Klicks überholt. Der zweite Klick tauschte
  // damit den NACHBARN zurück an seinen alten Platz — die beiden Klicks hoben sich auf, und der
  // Block stand wieder da, wo er war. Die Aktualisierungs-Form allein deckt das nicht ab: sie hält
  // den Zustand frisch, nicht das Argument.
  function move(id: string, delta: number) {
    // Der Bereichs-Test steht HIER und nicht nur im Aktualisierer: die Pfeile sind `aria-disabled`
    // und damit weiterhin auslösbar — wer am Rand Enter drückt, löste sonst zwar keinen Tausch aus,
    // bekäme aber trotzdem die Ansage „ist jetzt an Position 1 von 12" für einen Zug, den es nicht
    // gab. Stand vorher ein anderer Block in der Region, wechselte sie sogar auf den falschen Namen.
    const index = draft.findIndex((b) => b.id === id);
    const to = index + delta;
    if (index < 0 || to < 0 || to >= draft.length) return;

    setDraft((prev) => {
      // Im Aktualisierer noch einmal suchen, statt `index` von oben zu verwenden: zwischen dem Test
      // und diesem Aufruf kann eine zweite Betätigung liegen, und ein Index aus dem alten Entwurf
      // vertauschte dann die falschen beiden Zeilen.
      const from = prev.findIndex((b) => b.id === id);
      // `swapAt` bringt die Randprüfung mit (ausserhalb der Liste gibt es `prev` unverändert
      // zurück) — sie hier ein zweites Mal hinzuschreiben ist genau das, was sein Docblock den
      // Aufrufern erspart. Bei `from === -1` fällt sie ebenfalls durch.
      return swapAt(prev, from, from + delta);
    });
    // Merkt sich WEN es zuletzt getroffen hat; die neue Position liest die Ansage unten aus dem
    // fertigen Entwurf. Sie hier auszurechnen hiesse, die Vertauschung ein zweites Mal nachzubauen.
    setMovedId(id);
  }

  /** Ein Umschalter für beide Spalten: `hidden` und `collapsed` unterscheiden sich nur im Feld
   *  und im Wächter, und eine dritte Vorgabe wäre sonst die dritte Kopie derselben Figur. */
  function toggleFlag(index: number, feld: "hidden" | "collapsed") {
    setDraft((prev) => prev.map((b, i) => {
      if (i !== index) return b;
      // Gesperrt ist, was der Block nicht kann: `alwaysOn` blockiert das Ausblenden, eine fehlende
      // Vorgabe (`undefined`) das Zuklappen.
      if (feld === "hidden" ? b.alwaysOn : b.collapsed === undefined) return b;
      return { ...b, [feld]: !b[feld] };
    }));
  }

  function openEditor() {
    setDraft(meta);
    setBaseline(layoutSignature(meta));
    setError(null);
    // Ohne das trüge die Live-Region beim Öffnen schon den Satz vom letzten Mal. Inhalt, der beim
    // Einhängen einer Region bereits dasteht, wird nicht vorgelesen — er stünde nur im Weg, wenn
    // der erste echte Verschiebe-Satz zufällig derselbe wäre und deshalb als „unverändert" durchfiele.
    setMovedId(null);
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
  async function patchLayout(layout: { hidden: string[]; order: string[]; collapsed: string[] }) {
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
      collapsed: draft.filter((b) => b.collapsed).map((b) => b.id),
    });
  }

  /** Leere Listen heissen „keine eigene Anordnung" — der Nutzer folgt danach wieder der Vorgabe. */
  async function resetToDefault() {
    await patchLayout({ hidden: [], order: [], collapsed: [] });
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

          {/* Was der Dialog kann, in einem Satz — einmal oben statt fünfzehnmal in den Zeilen. */}
          <p className="px-4 py-2 text-neben text-foreground-faint">{t("editLayoutIntro")}</p>

          {error && <p className="px-4 py-3 text-sm text-warn bg-warn-bg">{error}</p>}

          <LiveStatus>{movedAnnounce}</LiveStatus>

          <ul className="divide-y divide-border-subtle">
            {/* Die Zeile ist mit `py-1` genau so hoch wie vorher mit `py-2.5` (56 px) — das Mass
                hängt jetzt an der gestapelten Pfeil-Spalte (2 × 24 px, WCAG 2.5.8), nicht mehr am
                Abstand. Wer den Abstand „aufräumt", macht die Liste höher. */}
            {draft.map((b, i) => (
              <li key={b.id} className={`flex items-center gap-2 px-3 py-1 ${b.hidden ? "opacity-50" : ""}`}>
                {/* Der Slot ist IMMER gefüllt — Auge oder Schloss. Das frühere Badge („Trägt eine
                    Frist — bleibt sichtbar") war 206 px breit und frass auf dem Handy den ganzen
                    Blocknamen; die Erklärung steht deshalb einmal am Fuss. */}
                {b.alwaysOn ? (
                  // `role="img"` mit Namen, NICHT `aria-hidden`: sonst verschwindet die Sperre für
                  // nicht-sehende Nutzer restlos. Vorher trug die Zeile den Satz als Badge-TEXT und
                  // einen abgeblendeten Knopf — beides ist weg, und die Fussnote allein verwiese auf
                  // ein Zeichen, das im Accessibility-Tree gar nicht existiert (lucide setzt jedem
                  // Icon ohne aria-Prop selbst `aria-hidden`).
                  <span className={metaRowSlotCls} role="img" aria-label={t("editLayoutLocked")}>
                    <LockClosedIcon size={16} />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleFlag(i, "hidden")}
                    aria-label={b.hidden ? t("editLayoutShow", { name: b.label }) : t("editLayoutHide", { name: b.label })}
                    aria-pressed={!b.hidden}
                    className={metaRowButtonCls}
                  >
                    {b.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}
                <span className="flex-1 min-w-0 text-sm text-foreground truncate">{b.label}</span>
                {/* Der dritte Schalter: in welchem Zustand der Block STARTET. Nur für Blöcke, die
                    eine eigene Rubrik haben — sie ist der Griff, und ohne sie gäbe es nichts
                    anzutippen. `alwaysOn`-Blöcke tragen ihn nie: zugeklappt ist verschwunden, und
                    die Begründung gegen das Ausblenden gilt dafür wörtlich weiter.
                    Er steht NUR hier und nicht auch am Block selbst gespeichert: was der Nutzer
                    zur Laufzeit klappt, gilt für den Besuch. */}
                {b.collapsed !== undefined && (
                  <button
                    type="button"
                    onClick={() => toggleFlag(i, "collapsed")}
                    // Der Name nennt den ZUSTAND und enthält das sichtbare Wort — beides nötig.
                    // Vorher beschrieb er die HANDLUNG („aufgeklappt zeigen") und daneben stand
                    // `aria-pressed`, das den Zustand meint: im zugeklappten Fall sagte die Ansage
                    // „aufgeklappt zeigen … gedrückt", also das Gegenteil dessen, was die Pille
                    // zeigte. Und ohne das sichtbare Wort im Namen greift keine Sprachsteuerung
                    // („Klick Offen" fand nichts) — WCAG 2.5.3.
                    aria-label={b.collapsed
                      ? t("editLayoutStartsClosed", { name: b.label })
                      : t("editLayoutStartsOpen", { name: b.label })}
                    className={metaRowChipCls}
                  >
                    <ChevronRight size={14} className={b.collapsed ? "" : "rotate-90"} />
                    {b.collapsed ? t("editLayoutStateClosed") : t("editLayoutStateOpen")}
                  </button>
                )}
                <ReorderButtons
                  index={i}
                  count={draft.length}
                  onMove={(dir) => move(b.id, dir)}
                  upLabel={t("editLayoutUp", { name: b.label })}
                  downLabel={t("editLayoutDown", { name: b.label })}
                />
              </li>
            ))}
          </ul>

          {/* Nur wenn es die Zeilen überhaupt gibt — sonst erklärt der Satz ein Zeichen, das
              nirgends steht. */}
          {draft.some((b) => b.alwaysOn) && (
            <p className="flex items-center gap-1.5 px-4 py-2 text-neben text-foreground-faint border-t border-border-subtle">
              <LockClosedIcon size={12} className="shrink-0" />
              {t("editLayoutLockedNote")}
            </p>
          )}

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
