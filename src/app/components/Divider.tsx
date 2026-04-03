type DividerVariant = "default" | "strong" | "labeled";

interface DividerProps {
  variant?: DividerVariant;
  label?: string;
  className?: string;
}

export default function Divider({ variant = "default", label, className = "" }: DividerProps) {
  if ((variant === "labeled" || label) && label) {
    return (
      <div className={`flex items-center gap-3 ${className}`} role="separator">
        <div className="flex-1 h-px bg-border-subtle" />
        <span className="text-xs text-foreground-faint font-medium shrink-0">{label}</span>
        <div className="flex-1 h-px bg-border-subtle" />
      </div>
    );
  }

  return (
    <hr
      className={[
        "border-0 h-px",
        variant === "strong" ? "bg-border" : "bg-border-subtle",
        className,
      ].filter(Boolean).join(" ")}
    />
  );
}
