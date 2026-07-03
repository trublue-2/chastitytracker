"use client";

import { useRouter } from "next/navigation";
import { Droplets } from "lucide-react";
import { useTranslations } from "next-intl";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import OrgasmusFormCore from "@/app/entries/OrgasmusFormCore";
import type { OrgasmusPayload, SubmitResult } from "@/app/entries/types";
import type { ResolvedReason } from "@/lib/reasonsService";

export default function OrgasmusForm({ userId, artOptions, tz, nowDefault }: { userId: string; artOptions: ResolvedReason[]; tz: string; nowDefault: string }) {
  const t = useTranslations("admin");
  const tOrgasm = useTranslations("orgasmForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const target = `/admin/users/${userId}/aktionen`;

  async function submitFn(payload: OrgasmusPayload): Promise<SubmitResult> {
    const res = await fetch("/api/admin/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...payload }),
    });
    if (res.ok) return { ok: true };
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.error || tc("error") };
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
