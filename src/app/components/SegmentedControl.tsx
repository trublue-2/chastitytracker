"use client";

interface Option {
  readonly value: string;
  readonly label: string;
}

interface Props {
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
}

export default function SegmentedControl({ options, value, onChange }: Props) {
  return (
    <div className="flex items-center bg-surface-raised rounded-lg p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            "px-2 py-1 rounded-md text-xs font-medium transition-colors",
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
