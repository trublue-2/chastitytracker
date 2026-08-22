import { formatTotalHours } from "@/lib/utils";
import { goalPct } from "@/lib/percent";

/**
 * Eine Zeile „Ziel erreicht zu X %": Beschriftung – Balken – `ist / soll` – Prozent.
 *
 * Geteilt von den KG-Zielen in der grünen Session-Karte (`LiveTrainingGoals`) und den
 * Kategorie-Zielen darunter (`CategoryGoalsLive`) — dieselbe Zeile stand vorher zweimal im Baum
 * und lief bereits auseinander (verschiedene Spaltenbreiten, verschiedene Schwellen für die
 * Füllfarbe). Der einzige echte Unterschied ist der Grund, auf dem sie liegt; dafür `tone`.
 *
 * Die dritte Zielanzeige (`StatsMain`) ist bewusst NICHT hier: sie ist zweizeilig, mit Pille statt
 * Prozentzahl und einer Unterzeile — eine andere Form, nicht dieselbe mit anderer Farbe.
 *
 * **Die `ist / soll`-Spalte darf umbrechen, der Balken hat feste Breite.** Umgekehrt war es zuerst
 * — und im laufenden Bild kippte daran die Jahres-Zeile: `222T 10h 29min / 51T 8h 52min` drückte
 * den mitwachsenden Balken auf einen Stummel und schob die Prozentzahl aus dem Bild. Mit der
 * Wort-Schreibweise schwankt diese Spalte eben stark (`20h` gegen `51T 8h 52min`), also bekommt
 * sie den Rest und darf zweizeilig werden, statt die Nachbarn zu verdrängen.
 *
 * Die Prozent-Spalte ist fest und breit genug für dreistellige Werte: `goalPct` klemmt bewusst
 * nicht, und 433 % ist bei einem Jahresziel keine Ausnahme.
 */
export default function GoalProgressRow({
  label,
  actual,
  target,
  tone = "onSurface",
}: {
  label: string;
  /** Ist-Stunden. */
  actual: number;
  /** Soll-Stunden. Bei `<= 0` rendert die Zeile nichts — ein Ziel von 0 ist kein Ziel. */
  target: number;
  tone?: "onSurface" | "onAccent";
}) {
  const pct = goalPct(actual, target);
  if (pct === null) return null;

  const onAccent = tone === "onAccent";
  const fill = onAccent
    ? pct >= 100 ? "bg-white" : pct >= 70 ? "bg-white/70" : "bg-white/40"
    : pct >= 100 ? "bg-ok" : pct >= 70 ? "bg-foreground-muted" : "bg-foreground-faint";

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs shrink-0 w-11 ${onAccent ? "text-white/70" : "text-foreground-faint"}`}>
        {label}
      </span>
      <div className={`w-12 sm:w-20 shrink-0 rounded-full h-1.5 overflow-hidden ${onAccent ? "bg-white/15" : "bg-background-subtle"}`}>
        <div className={`h-1.5 rounded-full transition-all ${fill}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-xs tabular-nums flex-1 min-w-0 text-right ${onAccent ? "text-white/60" : "text-foreground-muted"}`}>
        {formatTotalHours(actual)} / {formatTotalHours(target)}
      </span>
      <span className={`text-xs font-semibold tabular-nums w-12 text-right shrink-0 ${onAccent ? "text-white" : "text-foreground"}`}>
        {pct}%
      </span>
    </div>
  );
}
