"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { useTranslations } from "next-intl";
import FeedbackSheet from "./FeedbackSheet";

/**
 * Icon-only header button. Client-checked `disabled` — if disabled on the server
 * the component shouldn't be rendered at all (see FeedbackEnabled wrapper).
 */
export default function FeedbackButton({ variant = "icon" }: { variant?: "icon" | "menu" }) {
  const t = useTranslations("feedback");
  const [open, setOpen] = useState(false);

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
        <FeedbackSheet open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("title")}
        className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-raised transition"
      >
        <MessageSquareText size={18} />
      </button>
      <FeedbackSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
