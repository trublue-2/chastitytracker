"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import KontrolleFields from "./kontrolle/KontrolleFields";

export default function KontrolleButton({ userId, hasEmail }: { userId: string; hasEmail: boolean }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!hasEmail) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-inspect)] border border-[var(--color-inspect-border)] bg-[var(--color-inspect-bg)] rounded-lg px-2.5 py-2 hover:opacity-80 transition"
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
        />
      </ActionModal>
    </>
  );
}
