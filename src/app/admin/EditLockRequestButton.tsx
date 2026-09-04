"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import Spinner from "@/app/components/Spinner";
import FormError from "@/app/components/FormError";
import VerschlussAnforderungFields, { type LockRequestEditData } from "./verschluss-anforderung/VerschlussAnforderungFields";
import type { DeviceOption } from "@/lib/queries";
import { iconActionCls } from "@/app/components/inputStyles";

/**
 * Bearbeiten einer offenen Einschliess-ANFORDERUNG — die Schwester von {@link WithdrawButton}, steht
 * neben ihm. Bestand und Geräte werden erst beim Öffnen geladen (wie beim Anlegen-Chip), damit die
 * Übersicht nicht für jede Zeile die vollen Felder mitschleppt.
 */
export default function EditLockRequestButton({
  id,
  userId,
  tz,
  minNow,
}: {
  id: string;
  userId: string;
  /** Governing timezone of this row's sub (data owner). */
  tz: string;
  /** Server-computed "now" wall-clock in the sub's tz — datetime-local min (hydration-safe). */
  minNow: string;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState<LockRequestEditData | null>(null);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [error, setError] = useState("");

  // Bestand + Geräte einmal laden, sobald der Dialog zum ersten Mal öffnet.
  useEffect(() => {
    if (!open || existing) return;
    let cancelled = false;
    Promise.all([
      fetch(`/api/admin/verschluss-anforderung/${id}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch(`/api/devices?userId=${userId}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([row, devs]: [LockRequestEditData, DeviceOption[]]) => {
        if (cancelled) return;
        setExisting(row);
        setDevices(devs);
      })
      // Fehler sichtbar lassen statt den Dialog stumm zu schliessen — sonst wirkt der Klick folgenlos.
      .catch(() => { if (!cancelled) setError(tc("networkError")); });
    return () => { cancelled = true; };
  }, [open, existing, id, userId, tc]);

  const close = () => {
    setOpen(false);
    setExisting(null);
    setDevices([]);
    setError("");
  };

  const title = t("editLockRequestTitle");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={title}
        className={iconActionCls("neutral")}
      >
        <Pencil size={16} strokeWidth={2.5} />
      </button>

      <ActionModal
        open={open}
        onClose={close}
        title={title}
        icon={<Pencil size={20} strokeWidth={2} style={{ color: "var(--color-request)" }} />}
        iconBg="var(--color-request-bg)"
      >
        {existing ? (
          <VerschlussAnforderungFields
            userId={userId}
            art="ANFORDERUNG"
            devices={devices}
            tz={tz}
            minNow={minNow}
            existing={existing}
            onSuccess={() => { close(); router.refresh(); }}
          />
        ) : error ? (
          <FormError message={error} variant="compact" />
        ) : (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
      </ActionModal>
    </>
  );
}
