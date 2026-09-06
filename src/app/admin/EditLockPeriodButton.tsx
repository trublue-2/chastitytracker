"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";

import ActionModal from "@/app/components/ActionModal";
import LockPeriodEndForm from "./LockPeriodEndForm";
import { LockClosedIcon } from "@/app/components/lockIcons";
import { iconActionCls } from "@/app/components/inputStyles";

/**
 * Bearbeiten des Endes einer aktiven bzw. geplanten Sperrzeit — die Schwester von
 * {@link EditLockRequestButton}, steht wie diese als Bleistift neben dem Zurückziehen-Knopf. Anders
 * als dort muss nichts nachgeladen werden: eine Sperrzeit hat nur ihr Ende, und das kommt als Prop.
 */
export default function EditLockPeriodButton({
  id,
  endsAt,
  tz,
  minNow,
}: {
  id: string;
  /** Aktuelles Ende oder `null` = unbefristet. */
  endsAt: Date | null;
  /** Governing timezone of this row's sub (data owner). */
  tz: string;
  /** Server-computed "now" wall-clock in the sub's tz — datetime-local min (hydration-safe). */
  minNow: string;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const title = t("editLockDurationTitle");

  return (
    <>
      <button onClick={() => setOpen(true)} title={title} className={iconActionCls("neutral")}>
        <Pencil size={16} strokeWidth={2.5} />
      </button>

      <ActionModal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        icon={<LockClosedIcon size={20} strokeWidth={2} style={{ color: "var(--color-sperrzeit)" }} />}
        iconBg="var(--color-sperrzeit-bg)"
      >
        {/* Erst beim Öffnen mounten: so startet das Formular jedes Mal frisch aus dem aktuellen Ende. */}
        {open && (
          <LockPeriodEndForm
            lockPeriodId={id}
            endsAt={endsAt}
            tz={tz}
            minNow={minNow}
            onSuccess={() => { setOpen(false); router.refresh(); }}
          />
        )}
      </ActionModal>
    </>
  );
}
