"use client";

import { useRouter } from "next/navigation";
import { LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import OeffnenFormCore from "@/app/entries/OeffnenFormCore";
import type { OeffnenPayload, SubmitResult } from "@/app/entries/types";
import type { ResolvedReason } from "@/lib/reasonsService";

export default function OeffnenForm({ userId, grundOptions, tz, nowDefault }: { userId: string; grundOptions: ResolvedReason[]; tz: string; nowDefault: string }) {
  const t = useTranslations("admin");
  const tOffen = useTranslations("openForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const target = `/admin/users/${userId}/aktionen`;

  async function submitFn(payload: OeffnenPayload): Promise<SubmitResult> {
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
      icon={<LockOpen size={20} strokeWidth={2} />}
      iconBg="var(--color-unlock-bg)"
      iconColor="var(--color-unlock)"
      title={tOffen("title")}
    >
      <OeffnenFormCore
        grundOptions={grundOptions}
        tz={tz}
        nowDefault={nowDefault}
        submitFn={submitFn}
        onSuccess={() => router.push(target)}
        onCancel={() => router.push(target)}
        submitVariant="primary"
        defaultGrund="KEYHOLDER"
      />
    </AdminActionFormShell>
  );
}
