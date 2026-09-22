"use client";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import VerschlussAnforderungFields from "@/app/admin/verschluss-anforderung/VerschlussAnforderungFields";
import type { DeviceOption } from "@/lib/queries";
import { LockClosedIcon } from "@/app/components/lockIcons";

interface Props {
  userId: string;
  art: "ANFORDERUNG" | "SPERRZEIT";
  /** Sub ist verschlossen: eine Anforderung geht dann nur terminiert (siehe `resolveLockFormArt`). */
  scheduleOnly?: boolean;
  devices?: DeviceOption[];
  tz: string;
  minNow: string;
}

export default function VerschlussAnforderungForm({ userId, art, scheduleOnly = false, devices = [], tz, minNow }: Props) {
  const t = useTranslations("admin");
  const router = useRouter();
  const isLockPeriod = art === "SPERRZEIT";
  const accentColor = isLockPeriod ? "var(--color-sperrzeit)" : "var(--color-request)";
  const accentBg = isLockPeriod ? "var(--color-sperrzeit-bg)" : "var(--color-request-bg)";

  const close = () => router.push(`/admin/users/${userId}/aktionen`);

  return (
    <ActionModal
      open={true}
      onClose={close}
      title={isLockPeriod ? t("setLockDuration") : scheduleOnly ? t("planLock") : t("requestLock")}
      icon={<LockClosedIcon size={20} strokeWidth={2} style={{ color: accentColor }} />}
      iconBg={accentBg}
    >
      <VerschlussAnforderungFields
        userId={userId}
        art={art}
        scheduleOnly={scheduleOnly}
        devices={devices}
        tz={tz}
        minNow={minNow}
        onSuccess={close}
      />
    </ActionModal>
  );
}
