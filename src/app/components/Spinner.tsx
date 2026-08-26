"use client";

import { type SVGProps } from "react";
import { useTranslations } from "next-intl";

type SpinnerSize = "sm" | "default" | "lg";

interface SpinnerProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: SpinnerSize;
}

const sizeMap: Record<SpinnerSize, number> = {
  sm: 16,
  default: 20,
  lg: 32,
};

export default function Spinner({
  size = "default",
  className = "",
  ...rest
}: SpinnerProps) {
  // Der Name kam aus dem Code statt aus den Sprachdateien und war damit auf jeder englischen
  // Oberfläche deutsch. Er fällt nicht auf, weil ihn nur die Assistenztechnik liest — die
  // i18n-Pflicht gilt trotzdem, gerade dort.
  //
  // KEIN `label`-Prop mehr: es hatte genau einen Aufrufer (`Button`), und der übergab denselben
  // Text noch einmal aus demselben Namensraum. Ein Prop, das nur die Vorgabe wiederholt, ist eine
  // zweite Stelle, an der derselbe Name auseinanderlaufen kann.
  const t = useTranslations("common");
  const px = sizeMap[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className}`}
      role="status"
      aria-label={t("loading")}
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
