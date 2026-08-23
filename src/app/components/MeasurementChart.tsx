"use client";

import { useId } from "react";

/**
 * Ein Verlaufs-Diagramm für eine Messreihe: Punkte, geglättete Linie, optionale Ziel-Linie.
 *
 * **Handgezeichnetes SVG statt einer Bibliothek** — dieselbe Wahl wie bei `YearHeatmap`, dem einzigen
 * anderen Graphen der App. Eine Chart-Bibliothek wäre für diese eine Kurve die grössere Änderung:
 * neue Abhängigkeit im Bundle, eigenes Theming neben den Design-Tokens, und ein Verhalten, das
 * niemand hier kennt, wenn es einmal klemmt.
 *
 * Bewusst **ohne Gewichts-Begriffe**: die Komponente kennt Werte, Einheiten und eine Marke. Gewicht
 * ist ihr erster Nutzer, nicht ihr einziger denkbarer — die Zuordnung „was bedeuten die Zahlen"
 * bleibt beim Aufrufer.
 *
 * Skaliert wird über `viewBox` statt über feste Pixel: das Diagramm füllt seine Spalte auf jedem
 * Bildschirm, ohne dass jemand Breiten durchreichen muss.
 */

export interface ChartPoint {
  /** Position auf der Zeitachse — beliebige Zahl, nur die Reihenfolge und die Abstände zählen. */
  x: number;
  value: number;
  /** Abgesetzt gezeichnet: der Wert zählt, gehört aber nicht zur geglätteten Reihe. */
  muted?: boolean;
  /** Für den Tooltip des Punktes (`<title>`), z.B. „22.08.2026 · 79,4 kg". */
  label?: string;
}

interface Props {
  points: ChartPoint[];
  /** Die geglättete Linie. Leer = keine zeichnen. */
  trend: { x: number; value: number }[];
  /**
   * Waagerechte Marken — Vorgaben, keine Messungen: das Zielgewicht und die Schwelle der
   * Freigabe-Vorgabe. Eine leere Liste heisst: es gibt keine.
   *
   * `color` als Token-Name, weil die beiden auseinandergehalten werden müssen: das Ziel ist ein
   * Vorhaben, die Freigabe-Schwelle eine Bedingung mit Folgen. Beide gestrichelt zu zeichnen und
   * gleich zu färben hiesse, zwei Aussagen als eine zu zeigen.
   */
  markers?: { value: number; label?: string; color?: string }[];
  /** Untere/obere Grenze der Werteachse — kommt vom Aufrufer, damit mehrere Diagramme sie teilen können. */
  domain: { min: number; max: number };
  /** Beschriftung der Werteachse, z.B. „kg". */
  unit: string;
  /** Zugängliche Beschreibung des ganzen Bildes. */
  ariaLabel: string;
}

const W = 320;
const H = 140;
const PAD = { top: 8, right: 6, bottom: 16, left: 30 };

export default function MeasurementChart({ points, trend, markers = [], domain, unit, ariaLabel }: Props) {
  const clipId = useId();
  if (points.length === 0) return null;

  // Etwas Luft ober- und unterhalb, damit Punkte nicht auf dem Rahmen kleben. Eine Reihe ohne
  // Spannweite (alle Werte gleich) bekäme sonst eine Division durch null.
  const spread = Math.max(domain.max - domain.min, 1);
  const lo = domain.min - spread * 0.08;
  const hi = domain.max + spread * 0.08;

  const xs = points.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xSpan = Math.max(xMax - xMin, 1);

  const px = (x: number) => PAD.left + ((x - xMin) / xSpan) * (W - PAD.left - PAD.right);
  const py = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  const trendPath = trend.length
    ? trend.map((t, i) => `${i === 0 ? "M" : "L"}${px(t.x).toFixed(1)},${py(t.value).toFixed(1)}`).join(" ")
    : null;

  // Drei Beschriftungen reichen: unten, Mitte, oben. Mehr Zahlen machen die Achse zur Tabelle.
  const ticks = [lo, (lo + hi) / 2, hi];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        {/* Die Marke darf nicht über die Zeichenfläche hinauslaufen, wenn das Ziel weit ausserhalb
            der gezeigten Werte liegt. */}
        <clipPath id={clipId}>
          <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom} />
        </clipPath>
      </defs>

      {markers.length > 0 && (
        <g clipPath={`url(#${clipId})`}>
          {/* Gestrichelt, damit eine Marke nie mit der Trendlinie verwechselt wird: die eine ist eine
              Vorgabe, die andere eine Messung. */}
          {markers.map((m, i) => (
            <line
              key={i}
              x1={PAD.left} x2={W - PAD.right}
              y1={py(m.value)} y2={py(m.value)}
              stroke={m.color ?? "var(--color-ok)"}
              strokeWidth={1}
              strokeDasharray="3 3"
            >
              {m.label && <title>{m.label}</title>}
            </line>
          ))}
        </g>
      )}

      {ticks.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.left} x2={W - PAD.right}
            y1={py(v)} y2={py(v)}
            stroke="var(--color-border-subtle)"
            strokeWidth={0.5}
          />
          <text
            x={PAD.left - 4} y={py(v) + 3}
            textAnchor="end"
            className="fill-[var(--color-foreground-faint)]"
            style={{ fontSize: 7 }}
          >
            {Math.round(v)}
          </text>
        </g>
      ))}

      <text
        x={2} y={PAD.top + 4}
        className="fill-[var(--color-foreground-faint)]"
        style={{ fontSize: 7 }}
      >
        {unit}
      </text>

      {/* Die Trendlinie zuletzt vor den Punkten, aber in der KRÄFTIGEREN Farbe: sie ist die Aussage,
          die Punkte sind der Beleg. Farben ausschliesslich aus den Design-Tokens — ein erfundener
          Name (`--color-accent` gibt es hier nicht) zeichnet klaglos gar nichts. */}
      {trendPath && (
        <path d={trendPath} fill="none" stroke="var(--color-foreground)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      )}

      {points.map((p, i) => (
        <circle
          key={i}
          cx={px(p.x)}
          cy={py(p.value)}
          r={p.muted ? 1.6 : 2.1}
          fill={p.muted ? "none" : "var(--color-foreground-faint)"}
          stroke={p.muted ? "var(--color-foreground-faint)" : "none"}
          strokeWidth={p.muted ? 1 : 0}
        >
          {p.label && <title>{p.label}</title>}
        </circle>
      ))}
    </svg>
  );
}
