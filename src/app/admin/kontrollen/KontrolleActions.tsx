"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface Props {
  id: string;
  status: string;
  aiVerified: boolean | null;
}

export default function KontrolleActions({ id, status, aiVerified }: Props) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function doAction(action: string) {
    setLoading(action);
    await fetch(`/api/admin/kontrollen/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(null);
    router.refresh();
  }

  const canWithdraw = status === "open" || status === "overdue";
  const canManuallyVerify = (status === "fulfilled" || status === "overdue" || status === "rejected") && aiVerified !== true;
  const canReject = status === "fulfilled" || status === "overdue" || status === "ai";

  if (!canWithdraw && !canManuallyVerify && !canReject) return null;

  return (
    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
      {canManuallyVerify && (
        <button
          onClick={() => doAction("manuallyVerify")}
          disabled={loading !== null}
          className="text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100 disabled:opacity-50 transition whitespace-nowrap"
        >
          {loading === "manuallyVerify" ? "…" : t("kontrolleVerifyBtn")}
        </button>
      )}
      {canReject && (
        <button
          onClick={() => doAction("reject")}
          disabled={loading !== null}
          className="text-xs font-medium text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-1.5 hover:bg-red-100 disabled:opacity-50 transition whitespace-nowrap"
        >
          {loading === "reject" ? "…" : t("kontrolleRejectBtn")}
        </button>
      )}
      {canWithdraw && (
        <button
          onClick={() => doAction("withdraw")}
          disabled={loading !== null}
          className="text-xs font-medium text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 transition whitespace-nowrap"
        >
          {loading === "withdraw" ? "…" : t("kontrolleWithdrawBtn")}
        </button>
      )}
    </div>
  );
}
