"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, AlertTriangle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import FormError from "@/app/components/FormError";
import Button from "@/app/components/Button";
import { TYPE_STATS_KEYS } from "@/lib/constants";
import { formatDateTime, toDateLocale, APP_TZ } from "@/lib/utils";

interface Props {
  id: string;
  editHref: string;
  showDelete?: boolean;
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
}

interface PartnerInfo {
  id: string;
  type: string;
  startTime: string;
}

export default function EntryActions({ id, editHref, showDelete = true, tz = APP_TZ }: Props) {
  const t = useTranslations("entryActions");
  const tc = useTranslations("common");
  const tStats = useTranslations("stats");
  const [error, setError] = useState("");
  const [modalStep, setModalStep] = useState<"confirm" | "chainBreak" | null>(null);
  const [partnerInfo, setPartnerInfo] = useState<PartnerInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const dl = toDateLocale(useLocale());

  function closeModal() {
    setModalStep(null);
    setPartnerInfo(null);
    setError("");
    setSaving(false);
  }

  function handleDeleteClick() {
    setError("");
    setModalStep("confirm");
  }

  async function runDelete(query: string, onResponse?: (res: Response) => Promise<boolean>) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/entries/${id}${query}`, { method: "DELETE" });
      if (onResponse && await onResponse(res)) return;
      if (res.status === 204) {
        closeModal();
        router.refresh();
        return;
      }
      if (!res.ok) throw new Error();
      closeModal();
      router.refresh();
    } catch {
      setSaving(false);
      setError(tc("networkError"));
    }
  }

  function performDelete() {
    return runDelete("", async (res) => {
      if (res.status === 204) return false;
      if (res.ok) {
        const data = await res.json();
        if (data.chainBreak && data.partner) {
          setPartnerInfo(data.partner);
          setModalStep("chainBreak");
          setSaving(false);
          return true;
        }
      }
      return false;
    });
  }

  function deleteForce() {
    return runDelete("?force=true");
  }

  function deleteBoth() {
    if (!partnerInfo) return;
    return runDelete(`?withPartner=true&partnerId=${partnerInfo.id}`, async (res) => {
      if (res.status === 409) {
        setSaving(false);
        setError(t("partnerChanged"));
        return true;
      }
      return false;
    });
  }

  return (
    <>
      <RowActionsMenu
        items={[
          { label: t("edit"), icon: <Pencil size={14} className="text-foreground-faint" />, href: editHref },
          ...(showDelete
            ? [{ label: t("delete"), icon: <Trash2 size={14} />, onSelect: handleDeleteClick, danger: true }]
            : []),
        ]}
      />

      <ActionModal
        open={modalStep === "confirm"}
        onClose={closeModal}
        title={t("deleteConfirmTitle")}
        icon={<Trash2 size={20} style={{ color: "var(--color-warn)" }} />}
        iconBg="var(--color-warn-bg)"
      >
        <p className="text-sm text-foreground-muted">{t("deleteConfirm")}</p>
        <FormError message={error} />
        <Button variant="danger" fullWidth loading={saving} icon={<Trash2 size={16} />} onClick={performDelete}>
          {t("delete")}
        </Button>
        <Button variant="ghost" fullWidth onClick={closeModal}>
          {t("cancel")}
        </Button>
      </ActionModal>

      <ActionModal
        open={modalStep === "chainBreak"}
        onClose={closeModal}
        title={t("chainBreakTitle")}
        icon={<AlertTriangle size={20} style={{ color: "var(--color-warn)" }} />}
        iconBg="var(--color-warn-bg)"
      >
        {partnerInfo && (
          <p className="text-sm text-foreground-muted">
            {t("chainBreakWarning", {
              type: tStats(TYPE_STATS_KEYS[partnerInfo.type] ?? "lock"),
              date: formatDateTime(new Date(partnerInfo.startTime), dl, tz),
            })}
          </p>
        )}
        <FormError message={error} />
        <Button variant="danger" fullWidth loading={saving} onClick={deleteBoth}>
          {t("deleteBoth")}
        </Button>
        <Button variant="secondary" fullWidth loading={saving} onClick={deleteForce}>
          {t("deleteOnlyThis")}
        </Button>
        <Button variant="ghost" fullWidth onClick={closeModal}>
          {t("cancel")}
        </Button>
      </ActionModal>
    </>
  );
}
