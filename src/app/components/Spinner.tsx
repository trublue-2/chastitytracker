"use client";

import { type SVGProps } from "react";

type SpinnerSize = "sm" | "default" | "lg";

interface SpinnerProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: SpinnerSize;
  label?: string;
}

const sizeMap: Record<SpinnerSize, number> = {
  sm: 16,
  default: 20,
  lg: 32,
};

export default function Spinner({
  size = "default",
  label = "Laden…",
  className = "",
  ...rest
}: SpinnerProps) {
  const px = sizeMap[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className}`}
      role="status"
      aria-label={label}
      {...rest}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
