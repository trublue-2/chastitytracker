"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { useTranslations } from "next-intl";
import FeedbackSheet from "./FeedbackSheet";
import { headerIconBtnCls } from "./inputStyles";
import type { FeedbackSetup } from "@/lib/upstream/feedback";

/** Feedback-Knopf (Kopfzeile oder Menü-Zeile). `feedback` kommt vom Server (`feedbackSetup()`);
 *  bei Modus `off` rendert er nichts. */
export default function FeedbackButton({ variant = "icon", feedback }: { variant?: "icon" | "menu"; feedback: FeedbackSetup }) {
  const { mode, githubHref } = feedback;
  const t = useTranslations("feedback");
  const [open, setOpen] = useState(false);
  if (mode === "off") return null;
  const sheet = <FeedbackSheet open={open} onClose={() => setOpen(false)} mode={mode} githubHref={githubHref} />;

  if (variant === "menu") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised transition text-left"
        >
          <span className="flex items-center gap-3 text-sm text-foreground">
            <MessageSquareText size={16} className="text-foreground-muted" />
            {t("title")}
          </span>
        </button>
        {sheet}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("title")}
        className={headerIconBtnCls}
      >
        <MessageSquareText size={18} />
      </button>
      {sheet}
    </>
  );
}
