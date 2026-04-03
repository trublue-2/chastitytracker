import { type HTMLAttributes, type ReactNode } from "react";

type CardVariant = "default" | "outlined" | "semantic" | "interactive";
type CardPadding = "default" | "compact" | "none";
type SemanticColor = "lock" | "unlock" | "inspect" | "orgasm" | "request" | "sperrzeit" | "warn" | "ok";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  semantic?: SemanticColor;
  padding?: CardPadding;
  children: ReactNode;
}

const paddingClasses: Record<CardPadding, string> = {
  default: "p-4 sm:p-5",
  compact: "p-3",
  none: "",
};

export default function Card({
  variant = "default",
  semantic,
  padding = "default",
  className = "",
  children,
  ...rest
}: CardProps) {
  const baseClasses = [
    "rounded-xl border",
    paddingClasses[padding],
  ];

  switch (variant) {
    case "outlined":
      baseClasses.push("border-border bg-transparent");
      break;
    case "semantic":
      if (semantic) {
        baseClasses.push(
          `bg-${semantic}-bg border-[var(--color-${semantic}-border)]`,
        );
      }
      break;
    case "interactive":
      baseClasses.push(
        "border-border bg-surface shadow-card",
        "transition-all hover:shadow-raised hover:-translate-y-0.5",
      );
      break;
    default:
      baseClasses.push("border-border bg-surface shadow-card");
      break;
  }

  return (
    <div
      className={[...baseClasses, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
