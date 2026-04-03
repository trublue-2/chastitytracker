import { AlertTriangle } from "lucide-react";

interface Props {
  message?: string | null;
  /** "card" = full-width styled card (form header), "inline" = compact under field, "compact" = alias for inline (v2 compat) */
  variant?: "card" | "inline" | "compact";
}

export default function FormError({ message, variant = "card" }: Props) {
  if (!message) return null;

  if (variant === "inline" || variant === "compact") {
    return (
      <p className="text-sm text-warn-text flex items-center gap-1.5" role="alert">
        <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
        {message}
      </p>
    );
  }

  return (
    <div
      className="flex items-start gap-3 text-sm text-warn-text bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3"
      role="alert"
    >
      <AlertTriangle size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
