interface FormSuccessProps {
  message: string | null;
  /** "card" = full-width styled card (form header), "inline" = compact confirmation under a field. */
  variant?: "card" | "inline";
}

export default function FormSuccess({ message, variant = "card" }: FormSuccessProps) {
  if (!message) return null;

  if (variant === "inline") {
    return <p className="mt-2 text-sm text-ok-text">{message}</p>;
  }

  return (
    <p className="text-sm text-ok-text bg-ok-bg border border-ok-border rounded-xl px-4 py-3">
      {message}
    </p>
  );
}
