"use client";

import { useRouter } from "next/navigation";
import { Droplets } from "lucide-react";
import { useTranslations } from "next-intl";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import OrgasmusFormCore from "@/app/entries/OrgasmusFormCore";
import type { OrgasmusPayload, SubmitResult } from "@/app/entries/types";
import { submitAdminEntry } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import type { OrgasmusOption } from "@/lib/reasonsService";

export default function OrgasmusForm({ userId, artOptions, tz, nowDefault }: { userId: string; artOptions: OrgasmusOption[]; tz: string; nowDefault: string }) {
  const t = useTranslations("admin");
  const tOrgasm = useTranslations("orgasmForm");
  const apiError = useApiError();
  const router = useRouter();
  const target = `/admin/users/${userId}/aktionen`;

  async function submitFn(payload: OrgasmusPayload): Promise<SubmitResult> {
    return submitAdminEntry(userId, payload, apiError);
  }

  return (
    <AdminActionFormShell
      userId={userId}
      backLabel={t("aktionen")}
      icon={<Droplets size={20} strokeWidth={2} />}
      iconBg="var(--color-orgasm-bg)"
      iconColor="var(--color-orgasm)"
      title={tOrgasm("title")}
    >
      <OrgasmusFormCore
        artOptions={artOptions}
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
