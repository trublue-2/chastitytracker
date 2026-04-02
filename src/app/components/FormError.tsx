interface Props {
  message?: string | null;
  /** "default" = styled card (forms), "compact" = inline text (modals) */
  variant?: "default" | "compact";
}

export default function FormError({ message, variant = "default" }: Props) {
  if (!message) return null;

  if (variant === "compact") {
    return <p className="text-xs text-warn">{message}</p>;
  }

  return (
    <p className="text-sm text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">
      {message}
    </p>
  );
}
