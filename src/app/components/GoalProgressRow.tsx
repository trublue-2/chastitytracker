import { formatTotalHours } from "@/lib/utils";
import { goalPct } from "@/lib/percent";
import { goalOutlook } from "@/lib/goalOutlook";

/**
 * Eine Zielzeile: Beschriftung – `ist / soll` – **Auskunft**, darunter der Balken als Grundlinie.
 *
 * Die letzte Spalte trug bis v5.4 den Prozentwert. Der sagte dasselbe wie der Balken daneben — und
 * beantwortete die eigentliche Frage nicht: „8h 41min / 20h · 43 %" ist um 09 Uhr hervorragend und
 * um 22 Uhr verloren. Jetzt steht dort, was fehlt und ob es noch zu schaffen ist (`goalOutlook`).
 *
 * Geteilt von den KG-Zielen in der grünen Session-Karte (`LiveTrainingGoals`) und den
 * Kategorie-Zielen darunter (`CategoryGoalsLive`) — dieselbe Zeile stand vorher zweimal im Baum
 * und lief bereits auseinander (verschiedene Spaltenbreiten, verschiedene Schwellen für die
 * Füllfarbe). Der einzige echte Unterschied ist der Grund, auf dem sie liegt; dafür `tone`.
 *
 * Die dritte Zielanzeige (`StatsMain`) ist bewusst NICHT hier: sie ist zweizeilig, mit Pille statt
 * Prozentzahl und einer Unterzeile — eine andere Form, nicht dieselbe mit anderer Farbe.
 *
 * **Der Balken liegt UNTER der Zeile, nicht darin.** In der Reihe hatte er feste Breite, und die
 * Jahres-Zeile kippte trotzdem: `222T 10h 29min / 51T 8h 52min` drückte alles andere zusammen und
 * schob die letzte Spalte aus dem Bild. Als Grundlinie über die volle Breite konkurriert er mit
 * keiner Spalte mehr — und er zeigt den Anteil besser, weil er länger ist.
 *
 * Der Prozentwert lebt weiter — als Balkenbreite und als Rückfall, wenn die Zeile ihre Restzeit
 * nicht kennt (dann bleibt es beim alten Verhalten statt bei einer leeren Spalte).
 */
// `onAccent` heisst: die Zeile steht auf der grossen Zustandsfläche, nicht auf dem Grund. Sie nahm
// dafür Weiss — auf der Marken-Rose sind das 3,4:1 und damit bei 12 px durchgefallen. Die Fläche
// bringt ihre eigene Schriftfarbe mit (`--color-lock-on`), und die ist je Fassung eine andere:
// dunkel ein tiefes Weinrot, hell tatsächlich Weiss.
export default function GoalProgressRow({
  label,
  actual,
  target,
  remainingMs,
  outlookLabels,
  tone = "onSurface",
}: {
  label: string;
  /** Ist-Stunden. */
  actual: number;
  /** Soll-Stunden. Bei `<= 0` rendert die Zeile nichts — ein Ziel von 0 ist kein Ziel. */
  target: number;
  /** Verbleibende Zeit im Zeitraum. Ohne sie fehlt der Zeile die Auskunft und es bleibt beim
   *  Prozentwert — das ist der Zustand vor v5.4 und keine Katastrophe, nur weniger hilfreich. */
  remainingMs?: number;
  /** Fertige Texte der vier Lagen. Kommen von aussen, weil diese Datei keinen i18n-Zugang hat. */
  outlookLabels?: {
    reached: string;
    remaining: (time: string) => string;
    tight: (time: string) => string;
    missing: (time: string) => string;
  };
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

  // Die AUSKUNFT statt der Prozentzahl.
  //
  // Der Balken zeigt den Anteil bereits — die Prozentzahl daneben sagte dasselbe ein zweites Mal.
  // Damit war der Platz frei für das, was der Träger sonst selbst ausrechnen musste: „8h 41min /
  // 20h · 43 %" ist um 09 Uhr hervorragend und um 22 Uhr verloren, und die Zeile verriet nicht,
  // welcher der beiden Fälle vorliegt.
  //
  // Die Bewertung selbst steht in `goalOutlook` — geprüft, und damit an EINER Stelle, statt hier
  // und in der nächsten Anzeige verschieden getroffen zu werden.
  const outlook = remainingMs != null && outlookLabels ? goalOutlook(actual, target, remainingMs) : null;

  // Ab einem Tag auf volle Stunden runden. „noch 106h 48min" ist für ein Monatsziel eine
  // Scheingenauigkeit — auf die Minute plant niemand einen Monat — und bricht in der Spalte um.
  // Die Minute bleibt genau dort, wo sie zählt: beim Tagesziel, wo sie über heute entscheidet.
  const fehlend = (h: number) => formatTotalHours(h >= 24 ? Math.round(h) : h);
  const auskunft = !outlook || !outlookLabels ? null
    : outlook.kind === "reached" ? { text: outlookLabels.reached, cls: "text-ok" }
    : outlook.kind === "missed"  ? { text: outlookLabels.missing(fehlend(outlook.missingH)), cls: "text-warn" }
    : outlook.kind === "tight"   ? { text: outlookLabels.tight(fehlend(outlook.missingH)), cls: "text-warn" }
    : { text: outlookLabels.remaining(fehlend(outlook.missingH)), cls: onAccent ? "text-[var(--color-lock-on)]" : "text-foreground" };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-3">
        <span className={`text-fliess shrink-0 ${onAccent ? "text-[var(--color-lock-on-muted)]" : "text-foreground-muted"}`}>
          {label}
        </span>
        {/* Die Rohwerte bleiben: sie sind der Beleg für die Auskunft daneben. Sie treten aber
            zurück — vorher standen sie gleichwertig neben einem Prozentwert, jetzt tragen sie eine
            Aussage, die aus ihnen folgt. */}
        <span className={`text-neben tabular-nums ml-auto text-right ${onAccent ? "text-[var(--color-lock-on-muted)]" : "text-foreground-faint"}`}>
          {formatTotalHours(actual)} / {formatTotalHours(target)}
        </span>
        <span className={`text-neben font-semibold tabular-nums shrink-0 text-right ${auskunft ? auskunft.cls : onAccent ? "text-[var(--color-lock-on)]" : "text-foreground"}`}>
          {auskunft ? auskunft.text : `${pct}%`}
        </span>
      </div>
      {/* Der Balken ist die GRUNDLINIE der Zeile, kein Element neben den anderen.
          
          Vorher hatte er eine feste Breite und stand mitten in der Reihe — und genau daran kippte
          die Zeile: die `ist / soll`-Spalte schwankt mit der Wort-Schreibweise zwischen „20h" und
          „51T 8h 52min", also musste irgendwer nachgeben. Als Unterstreichung nimmt er die volle
          Breite, konkurriert mit niemandem mehr, und die Zeile darüber teilt sich den Platz nach
          der einzigen Regel, die zählt: Beschriftung links, Auskunft rechts. */}
      <div className={`h-0.5 w-full overflow-hidden rounded-full ${onAccent ? "bg-[var(--color-lock-on-muted)]/25" : "bg-border-subtle"}`}>
        <div className={`h-full rounded-full transition-all ${fill}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
