"use client";

import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import VerschlussFormCore from "@/app/entries/VerschlussFormCore";
import type { VerschlussPayload, SubmitResult } from "@/app/entries/types";
import { submitAdminEntry } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import type { DeviceOption } from "@/lib/queries";

export default function VerschlussForm({ userId, devices = [], tz, nowDefault }: { userId: string; devices?: DeviceOption[]; tz: string; nowDefault: string }) {
  const t = useTranslations("admin");
  const tLock = useTranslations("lockForm");
  const apiError = useApiError();
  const router = useRouter();
  const target = `/admin/users/${userId}/aktionen`;

  async function submitFn(payload: VerschlussPayload): Promise<SubmitResult> {
    return submitAdminEntry(userId, payload, apiError);
  }

  return (
    <AdminActionFormShell
      userId={userId}
      backLabel={t("aktionen")}
      icon={<Lock size={20} strokeWidth={2} />}
      iconBg="var(--color-lock-bg)"
      iconColor="var(--color-lock)"
      title={tLock("title")}
    >
      <VerschlussFormCore
        devices={devices}
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
