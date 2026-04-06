"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreVertical, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import FormError from "@/app/components/FormError";
import Button from "@/app/components/Button";
import { TYPE_STATS_KEYS } from "@/lib/constants";
import { formatDateTime, toDateLocale } from "@/lib/utils";

interface Props {
  id: string;
  editHref: string;
  showDelete?: boolean;
}

interface PartnerInfo {
  id: string;
  type: string;
  startTime: string;
}

export default function EntryActions({ id, editHref, showDelete = true }: Props) {
  const t = useTranslations("entryActions");
  const tc = useTranslations("common");
  const tStats = useTranslations("stats");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [error, setError] = useState("");
  const [modalStep, setModalStep] = useState<"confirm" | "chainBreak" | null>(null);
  const [partnerInfo, setPartnerInfo] = useState<PartnerInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const dl = toDateLocale(useLocale());

  function openMenu() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(true);
  }

  function closeModal() {
    setModalStep(null);
    setPartnerInfo(null);
    setError("");
    setSaving(false);
  }

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent | TouchEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);

  function handleDeleteClick() {
    setOpen(false);
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
    <div className="relative flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        className="w-6 h-6 flex items-center justify-center rounded-lg text-foreground-faint hover:text-foreground hover:bg-surface-raised active:bg-border transition"
        aria-label={t("ariaActions")}
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ top: pos.top, right: pos.right }}
          className="fixed w-36 bg-surface border border-border-subtle rounded-xl shadow-lg z-50 overflow-hidden"
        >
          <Link
            href={editHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-foreground-muted hover:bg-surface-raised transition"
          >
            <Pencil size={14} className="text-foreground-faint" />
            {t("edit")}
          </Link>
          {showDelete && (
            <>
              <div className="border-t border-border-subtle" />
              <button
                type="button"
                onClick={handleDeleteClick}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-warn hover:bg-warn-bg transition"
              >
                <Trash2 size={14} />
                {t("delete")}
              </button>
            </>
          )}
        </div>
      )}

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
              date: formatDateTime(new Date(partnerInfo.startTime), dl),
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
    </div>
  );
}
