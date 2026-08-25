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
// `onAccent` heisst: die Zeile steht auf der grossen Zustandsfläche, nicht auf dem Grund. Sie nahm
// dafür Weiss — auf der Marken-Rose sind das 3,4:1 und damit bei 12 px durchgefallen. Die Fläche
// bringt ihre eigene Schriftfarbe mit (`--color-lock-on`), und die ist je Fassung eine andere:
// dunkel ein tiefes Weinrot, hell tatsächlich Weiss.
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

  // EINE Füllung für beide Untergründe. Vorher stand auf der Akzentfläche `bg-white` — das war
  // schon auf der alten grünen Fläche nur knapp lesbar und auf einer hellen Tönung unsichtbar.
  // Seit die Fläche eine Tönung und kein Farbblock mehr ist, braucht es die Sonderbehandlung
  // ohnehin nicht: die Rampe trägt auf beiden Gründen.
  //
  // Die Stufen sagen dabei etwas: erreicht ist eine AUSZEICHNUNG (Gold), alles darunter ist
  // Intensität — dieselbe Helligkeits-Rampe wie im Tragekalender, nicht eine zweite Sprache.
  const fill = pct >= 100 ? "bg-ok" : pct >= 70 ? "bg-[var(--wear-4)]" : "bg-[var(--wear-3)]";

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs shrink-0 w-11 ${onAccent ? "text-[var(--color-lock-on-muted)]" : "text-foreground-faint"}`}>
        {label}
      </span>
      <div className={`w-12 sm:w-20 shrink-0 rounded-full h-1.5 overflow-hidden ${onAccent ? "bg-background-subtle" : "bg-background-subtle"}`}>
        <div className={`h-1.5 rounded-full transition-all ${fill}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-xs tabular-nums flex-1 min-w-0 text-right ${onAccent ? "text-[var(--color-lock-on-muted)]" : "text-foreground-muted"}`}>
        {formatTotalHours(actual)} / {formatTotalHours(target)}
      </span>
      <span className={`text-xs font-semibold tabular-nums w-12 text-right shrink-0 ${onAccent ? "text-[var(--color-lock-on)]" : "text-foreground"}`}>
        {pct}%
      </span>
    </div>
  );
}
