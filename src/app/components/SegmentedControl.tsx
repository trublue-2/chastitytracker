"use client";

interface Option {
  readonly value: string;
  readonly label: string;
}

/**
 * `sm` ist die kompakte Fassung für kleine Umschalter, die für sich stehen (Sprache, Theme).
 * `md` trifft die Höhe von `Select` und `Input` (`h-11`) — für Steuerungen, die in einer Reihe MIT
 * solchen Feldern stehen. Ungleich hohe Bedienelemente nebeneinander sind der häufigste Grund,
 * warum eine Leiste unaufgeräumt wirkt.
 */
type SegmentedSize = "sm" | "md";

const BOX: Record<SegmentedSize, string> = {
  sm: "p-0.5 gap-0.5",
  md: "h-11 p-1 gap-1",
};

const ITEM: Record<SegmentedSize, string> = {
  sm: "px-2 py-1 text-xs",
  md: "h-full px-3 text-sm",
};

interface Props {
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
  size?: SegmentedSize;
}

export default function SegmentedControl({ options, value, onChange, size = "sm" }: Props) {
  return (
    <div className={`flex items-center bg-surface-raised rounded-lg ${BOX[size]}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            "rounded-md font-medium transition-colors",
            ITEM[size],
            value === opt.value
              ? "bg-surface text-foreground shadow-sm"
              : "text-foreground-faint hover:text-foreground-muted",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
