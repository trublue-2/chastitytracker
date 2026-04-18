"use client";

import { useRouter } from "next/navigation";
import { Droplets } from "lucide-react";
import { useTranslations } from "next-intl";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import OrgasmusFormCore, { type OrgasmusPayload, type SubmitResult } from "@/app/entries/OrgasmusFormCore";

export default function OrgasmusForm({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const tOrgasm = useTranslations("orgasmForm");
  const tc = useTranslations("common");
  const router = useRouter();

  async function submitFn(payload: OrgasmusPayload): Promise<SubmitResult> {
    const res = await fetch("/api/admin/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...payload }),
    });
    if (res.ok) {
      router.push(`/admin/users/${userId}/aktionen`);
      return { ok: true };
    }
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
      <div className="px-5 py-5">
        <OrgasmusFormCore submitFn={submitFn} submitVariant="primary" submitLabel={tOrgasm("title")} />
      </div>
    </AdminActionFormShell>
  );
}
