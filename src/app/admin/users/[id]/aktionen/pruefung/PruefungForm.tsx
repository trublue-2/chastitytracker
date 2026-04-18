"use client";

import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import PruefungFormCore, { type PruefungPayload, type SubmitResult } from "@/app/entries/PruefungFormCore";

export default function PruefungForm({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const tInspection = useTranslations("inspectionForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const target = `/admin/users/${userId}/aktionen`;

  async function submitFn(payload: PruefungPayload): Promise<SubmitResult> {
    const res = await fetch("/api/admin/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...payload }),
    });
    if (res.ok) {
      router.push(target);
      return { ok: true };
    }
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.error || tc("error") };
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
      <div className="px-5 py-5">
        <PruefungFormCore
          submitFn={submitFn}
          onCancel={() => router.push(target)}
          submitVariant="primary"
          submitLabel={tInspection("saveBtn")}
        />
      </div>
    </AdminActionFormShell>
  );
}
