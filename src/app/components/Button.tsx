"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Spinner from "./Spinner";
import { hapticLight } from "@/lib/haptics";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "semantic";
type ButtonSize = "sm" | "default" | "lg";
type SemanticColor = "lock" | "unlock" | "inspect" | "orgasm" | "request" | "sperrzeit" | "warn" | "ok";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  semantic?: SemanticColor;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm:      "min-h-12 px-4 text-sm gap-1.5",
  default: "min-h-12 px-5 text-sm gap-2",
  lg:      "min-h-14 px-6 text-base gap-2",
};

const spinnerSize: Record<ButtonSize, "sm" | "default"> = {
  sm:      "sm",
  default: "sm",
  lg:      "default",
};

function variantClasses(variant: ButtonVariant, semantic?: SemanticColor): string {
  switch (variant) {
    case "primary":
      return "bg-btn-primary text-btn-primary-text hover:bg-btn-primary-hover active:bg-btn-primary-hover shadow-card hover:shadow-raised";
    case "secondary":
      return "bg-surface text-foreground border border-border hover:bg-background-subtle active:bg-background-subtle shadow-card";
    case "ghost":
      return "bg-transparent text-foreground-muted hover:bg-background-subtle active:bg-background-subtle";
    case "danger":
      return "bg-warn text-white hover:opacity-90 active:opacity-80 shadow-card";
    case "semantic": {
      if (!semantic) return variantClasses("primary");
      const semanticBgMap: Record<SemanticColor, string> = {
        lock:      "bg-btn-lock",
        unlock:    "bg-btn-unlock",
        inspect:   "bg-btn-inspect",
        orgasm:    "bg-btn-orgasm",
        request:   "bg-btn-request",
        sperrzeit: "bg-btn-sperrzeit",
        warn:      "bg-btn-warn",
        ok:        "bg-btn-ok",
      };
      return `${semanticBgMap[semantic]} text-white hover:opacity-90 active:opacity-80 shadow-card`;
    }
    default:
      return "";
  }
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "default",
    semantic,
    loading = false,
    fullWidth = false,
    icon,
    iconRight,
    disabled,
    children,
    className = "",
    type = "button",
    onClick,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    hapticLight();
    onClick?.(e);
  }

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      onClick={handleClick}
      className={[
        "inline-flex items-center justify-center font-medium rounded-lg",
        "transition-all select-none active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        sizeClasses[size],
        variantClasses(variant, semantic),
        fullWidth ? "w-full" : "",
        isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    >
      {loading ? (
        <Spinner size={spinnerSize[size]} label="Laden…" />
      ) : icon ? (
        <span className="shrink-0" aria-hidden="true">{icon}</span>
      ) : null}
      {children && <span>{children}</span>}
      {iconRight && !loading && (
        <span className="shrink-0" aria-hidden="true">{iconRight}</span>
      )}
    </button>
  );
});

export default Button;
