"use client";

import { RotateCcw, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Rotation } from "@/lib/constants";

interface RotatableImagePreviewProps {
  src: string;
  rotation: Rotation;
  onRotateLeft: () => void;
  onRotateRight: () => void;
}

export default function RotatableImagePreview({
  src,
  rotation,
  onRotateLeft,
  onRotateRight,
}: RotatableImagePreviewProps) {
  const t = useTranslations("common");

  return (
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
      <div
        className="w-20 h-20 rounded-xl overflow-hidden"
        style={{ transform: `rotate(${rotation}deg)`, transition: "transform 0.2s ease" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={t("preview")} className="w-full h-full object-cover" />
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onRotateLeft}
          className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground active:text-foreground transition-colors"
          aria-label={t("rotateLeft")}
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          onClick={onRotateRight}
          className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground active:text-foreground transition-colors"
          aria-label={t("rotateRight")}
        >
          <RotateCw size={14} />
        </button>
      </div>
    </div>
  );
}
