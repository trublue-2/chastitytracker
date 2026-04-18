"use client";

import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import VerschlussFormCore, { type VerschlussPayload, type SubmitResult } from "@/app/entries/VerschlussFormCore";
import type { DeviceOption } from "@/lib/queries";

export default function VerschlussForm({ userId, devices = [] }: { userId: string; devices?: DeviceOption[] }) {
  const t = useTranslations("admin");
  const tLock = useTranslations("lockForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const target = `/admin/users/${userId}/aktionen`;

  async function submitFn(payload: VerschlussPayload): Promise<SubmitResult> {
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
      icon={<Lock size={20} strokeWidth={2} />}
      iconBg="var(--color-lock-bg)"
      iconColor="var(--color-lock)"
      title={tLock("title")}
    >
      <div className="px-5 py-5">
        <VerschlussFormCore
          devices={devices}
          submitFn={submitFn}
          onCancel={() => router.push(target)}
          submitVariant="primary"
          submitLabel={tLock("saveBtn")}
        />
      </div>
    </AdminActionFormShell>
  );
}
