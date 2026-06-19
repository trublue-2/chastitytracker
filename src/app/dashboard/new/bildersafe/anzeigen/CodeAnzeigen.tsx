"use client";

import { useState } from "react";
import { Lock, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import Card from "@/app/components/Card";
import { FullscreenImageModal } from "@/app/components/ImageViewer";

export default function CodeAnzeigen({
  isLocked,
  codeImageUrl,
  revealed,
}: {
  isLocked: boolean;
  codeImageUrl: string | null;
  revealed: boolean;
}) {
  const t = useTranslations("newEntry");
  const [open, setOpen] = useState(false);

  if (!isLocked) {
    return <p className="text-sm text-foreground-muted">{t("bildersafeShowNotLocked")}</p>;
  }
  if (!codeImageUrl) {
    return <p className="text-sm text-foreground-muted">{t("bildersafeShowNoCode")}</p>;
  }
  if (!revealed) {
    return (
      <Card variant="semantic" semantic="sperrzeit">
        <div className="flex items-start gap-2.5">
          <Lock size={18} className="text-sperrzeit mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-sperrzeit-text">{t("bildersafeShowSealed")}</p>
            <p className="text-xs text-sperrzeit mt-0.5">{t("bildersafeShowSealedHint")}</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground-muted">{t("bildersafeShowReadHint")}</p>
      <button type="button" onClick={() => setOpen(true)} className="block w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={codeImageUrl} alt={t("bildersafeShowTitle")} className="w-full rounded-2xl border border-border object-contain max-h-[70vh] bg-surface" />
      </button>
      <p className="inline-flex items-center gap-1.5 text-xs text-foreground-faint">
        <KeyRound size={12} /> {t("bildersafeShowTapHint")}
      </p>
      {open && <FullscreenImageModal src={codeImageUrl} alt={t("bildersafeShowTitle")} onClose={() => setOpen(false)} />}
    </div>
  );
}
