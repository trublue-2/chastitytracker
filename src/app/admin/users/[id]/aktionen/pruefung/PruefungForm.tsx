"use client";

import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import PruefungFormCore from "@/app/entries/PruefungFormCore";
import type { PruefungPayload, SubmitResult } from "@/app/entries/types";
import { submitAdminEntry } from "@/lib/apiClient";

export default function PruefungForm({ userId, tz, nowDefault }: { userId: string; tz: string; nowDefault: string }) {
  const t = useTranslations("admin");
  const tInspection = useTranslations("inspectionForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const target = `/admin/users/${userId}/aktionen`;

  async function submitFn(payload: PruefungPayload): Promise<SubmitResult> {
    return submitAdminEntry(userId, payload, tc("error"));
  }

  return (
    <AdminActionFormShell
      userId={userId}
      backLabel={t("aktionen")}
      icon={<ClipboardCheck size={20} strokeWidth={2} />}
      iconBg="var(--color-inspect-bg)"
      iconColor="var(--color-inspect)"
      title={tInspection("title")}
    >
      <PruefungFormCore
        tz={tz}
        nowDefault={nowDefault}
        submitFn={submitFn}
        onSuccess={() => router.push(target)}
        onCancel={() => router.push(target)}
        submitVariant="primary"
      />
    </AdminActionFormShell>
  );
}
