"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import ActionModal from "@/app/components/ActionModal";
import Button from "@/app/components/Button";
import Checkbox from "@/app/components/Checkbox";
import FormError from "@/app/components/FormError";
import { LockOpenIcon } from "@/app/components/lockIcons";
import { fetchWithTimeout, parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { RELEASE_ORGASM_WINDOW_H } from "@/lib/constants";

interface Props {
  userId: string;
  /** Läuft gerade eine Sperrzeit? Dann sagt das Blatt, dass sie mit endet. */
  hasActiveSperrzeit: boolean;
}

/**
 * „Sofort aufschliessen" — die Schnellaktion, die das Gegenteil der Sperrzeit tut.
 *
 * Ein Tipp, ein Bestätigungs-Blatt, fertig. Das Blatt ist keine Zierde: der Griff ist unumkehrbar
 * (eine beendete Sperrzeit kommt nicht zurück, sie muss neu gesetzt werden) und er zieht drei
 * Wirkungen nach sich, von denen zwei unsichtbar sind — die Box und der Eintrag. Wer nur „Sofort
 * aufschliessen" liest, rechnet mit einer davon.
 */
export default function ReleaseNowButton({ userId, hasActiveSperrzeit }: Props) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [allowOrgasm, setAllowOrgasm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function close() {
    setOpen(false);
    setAllowOrgasm(false);
    setError("");
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithTimeout("/api/admin/release-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, allowOrgasm }),
      });
      if (!res.ok) {
        setError(apiError(await parseApiErrorCode(res)));
        return;
      }
      close();
      router.refresh();
    } catch {
      setError(apiError(null));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium border rounded-lg px-2.5 py-2 transition text-unlock border-[var(--color-unlock-border)] bg-[var(--color-unlock-bg)] hover:opacity-80"
      >
        <LockOpenIcon size={11} />
        {t("releaseNow")}
      </button>

      <ActionModal
        open={open}
        onClose={close}
        title={t("releaseNow")}
        icon={<LockOpenIcon size={20} strokeWidth={2} style={{ color: "var(--color-unlock)" }} />}
        iconBg="var(--color-unlock-bg)"
        busy={saving}
      >
        <div className="flex flex-col gap-4">
          {/* Was gleich passiert, in der Reihenfolge, in der es passiert. Zwei der drei Wirkungen
              sieht die Keyholderin sonst nirgends. */}
          <ul className="flex flex-col gap-1.5 text-sm text-foreground-muted list-disc pl-5">
            {hasActiveSperrzeit && <li>{t("releaseNowEndsLockPeriod")}</li>}
            <li>{t("releaseNowOpensBox")}</li>
            <li>{t("releaseNowRecordsOpening")}</li>
          </ul>

          <Checkbox
            label={t("releaseNowAllowOrgasm", { hours: RELEASE_ORGASM_WINDOW_H })}
            checked={allowOrgasm}
            onChange={(e) => setAllowOrgasm(e.target.checked)}
          />

          {/* Die eine Sache, die man hinterher nicht mehr rückgängig macht. */}
          <p className="text-xs text-foreground-faint">{t("releaseNowHint")}</p>

          {error && <FormError message={error} />}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={close} disabled={saving}>{tc("cancel")}</Button>
            <Button variant="semantic" semantic="unlock" onClick={submit} loading={saving}>
              {t("releaseNowConfirm")}
            </Button>
          </div>
        </div>
      </ActionModal>
    </>
  );
}
