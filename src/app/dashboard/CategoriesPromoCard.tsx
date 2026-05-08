"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Tags, X } from "lucide-react";
import Card from "@/app/components/Card";

const DISMISS_KEY = "categories-promo-dismissed-v1";

interface Props {
  /** When true, the user has 0 user-defined categories — only KG-built-in exists. */
  show: boolean;
}

/** One-shot promo card on the dashboard inviting the user to create their first
 *  non-KG category. Hidden after dismiss (localStorage flag). */
export default function CategoriesPromoCard({ show }: Props) {
  const t = useTranslations("dashboard");
  const [dismissed, setDismissed] = useState(true); // start dismissed to avoid SSR flicker

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!show || dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pb-2">
      <Card>
        <div className="flex items-start gap-3 p-4">
          <div className="size-10 rounded-lg flex items-center justify-center shrink-0 bg-background-subtle text-foreground-muted" aria-hidden>
            <Tags size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{t("promoTitle")}</p>
            <p className="text-xs text-foreground-muted mt-1">{t("promoBody")}</p>
            <Link
              href="/dashboard/categories"
              className="inline-block mt-2 text-sm font-medium text-foreground underline"
            >
              {t("promoCta")} →
            </Link>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("promoDismiss")}
            className="size-8 rounded-lg flex items-center justify-center text-foreground-faint hover:bg-background-subtle transition shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      </Card>
    </div>
  );
}
