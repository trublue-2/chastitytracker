"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import VerschlussAnforderungFields from "./verschluss-anforderung/VerschlussAnforderungFields";
import type { DeviceOption } from "@/lib/queries";
import { LockClosedIcon } from "@/app/components/lockIcons";
import { overviewChipCls } from "@/app/components/inputStyles";

interface Props {
  userId: string;
  isLocked: boolean;
  hasActiveLockPeriod: boolean;
  /** Governing timezone of this row's sub (data owner). */
  tz: string;
  /** Server-computed "now" wall-clock in the sub's tz — datetime-local min (hydration-safe). */
  minNow: string;
}

export default function VerschlussAnforderungButton({
  userId, isLocked, hasActiveLockPeriod, tz, minNow,
}: Props) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [devicesFetched, setDevicesFetched] = useState(false);

  // Fetch user's devices once when modal first opens (only for ANFORDERUNG)
  useEffect(() => {
    if (!open || isLocked || devicesFetched) return;
    fetch(`/api/devices?userId=${userId}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: DeviceOption[]) => { setDevices(data); setDevicesFetched(true); })
      .catch(() => setDevices([]));
  }, [open, userId, isLocked, devicesFetched]);

  const art = isLocked ? "SPERRZEIT" : "ANFORDERUNG";
  const isAnforderung = art === "ANFORDERUNG";
  const label = isAnforderung ? t("requestLock") : t("setLockDuration");
  const accentColor = isAnforderung ? "var(--color-request)" : "var(--color-sperrzeit)";
  const accentBg = isAnforderung ? "var(--color-request-bg)" : "var(--color-sperrzeit-bg)";

  // Exklusiv ist allein die Sperrzeit — eine zweite überschriebe die laufende. Dass die
  // Anforderung keine E-Mail mehr verlangt: Begründung im Dienst.
  if (isLocked && hasActiveLockPeriod) return null;

  const close = () => {
    setOpen(false);
    setDevicesFetched(false);
    setDevices([]);
  };

  const btnBase = isAnforderung
    ? "text-[var(--color-request)] border-[var(--color-request-border)] bg-[var(--color-request-bg)] hover:opacity-80"
    : "text-[var(--color-sperrzeit)] border-[var(--color-sperrzeit-border)] bg-[var(--color-sperrzeit-bg)] hover:opacity-80";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`${overviewChipCls} ${btnBase}`}
      >
        <LockClosedIcon size={11} />
        {label}
      </button>

      <ActionModal
        open={open}
        onClose={close}
        title={label}
        icon={<LockClosedIcon size={20} strokeWidth={2} style={{ color: accentColor }} />}
        iconBg={accentBg}
      >
        <VerschlussAnforderungFields
          userId={userId}
          art={art}
          devices={devices}
          tz={tz}
          minNow={minNow}
          onSuccess={() => { close(); router.refresh(); }}
        />
      </ActionModal>
    </>
  );
}
