"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import { overviewChipCls } from "@/app/components/inputStyles";
import KontrolleFields from "./kontrolle/KontrolleFields";
import type { InspectionTargetOption } from "@/lib/inspectionTarget";

export default function KontrolleButton({ userId, hasEmail, targets }: {
  userId: string;
  hasEmail: boolean;
  /** Vom Server vorberechnete Ziele, wo die Seite sie ohnehin lädt. Ohne sie holt das Formular sie
   *  selbst — die Admin-Übersicht listet viele Subs und soll dafür nicht je Zeile abfragen. */
  targets?: InspectionTargetOption[];
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!hasEmail) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`${overviewChipCls} text-[var(--color-inspect)] border-[var(--color-inspect-border)] bg-[var(--color-inspect-bg)] hover:opacity-80`}
      >
        <Bell size={11} />
        {t("requestInspection")}
      </button>

      <ActionModal
        open={open}
        onClose={() => setOpen(false)}
        title={t("kontrolleTitle")}
        icon={<Bell size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />}
        iconBg="var(--color-inspect-bg)"
      >
        <KontrolleFields
          userId={userId}
          onSuccess={() => { setOpen(false); router.refresh(); }}
          initialTargets={targets}
        />
      </ActionModal>
    </>
  );
}
