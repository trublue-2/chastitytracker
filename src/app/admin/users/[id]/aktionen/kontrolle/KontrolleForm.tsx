"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import KontrolleFields from "@/app/admin/kontrolle/KontrolleFields";

export default function KontrolleForm({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const close = () => router.push(`/admin/users/${userId}/aktionen`);

  return (
    <ActionModal
      open={true}
      onClose={close}
      title={t("kontrolleTitle")}
      icon={<Bell size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />}
      iconBg="var(--color-inspect-bg)"
    >
      <KontrolleFields userId={userId} onSuccess={close} />
    </ActionModal>
  );
}
