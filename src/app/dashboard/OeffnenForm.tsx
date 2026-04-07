"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toDatetimeLocal, toDateLocale, APP_TZ } from "@/lib/utils";
import { OEFFNEN_GRUENDE } from "@/lib/constants";
import { AlertCircle, Lock } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import DateTimePicker from "@/app/components/DateTimePicker";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import Card from "@/app/components/Card";
import Sheet from "@/app/components/Sheet";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";

type OeffnenGrund = typeof OEFFNEN_GRUENDE[number];

interface Props {
  initial?: { id: string; startTime: string; note?: string | null; oeffnenGrund?: string | null };
  sperrzeitEndetAt?: string | null;
  sperrzeitUnbefristet?: boolean;
  reinigungErlaubt?: boolean;
  reinigungMaxMinuten?: number;
  redirectTo?: string;
}

export default function OeffnenForm({ initial, sperrzeitEndetAt, sperrzeitUnbefristet = false, reinigungErlaubt = false, reinigungMaxMinuten = 15, redirectTo }: Props) {
  const t = useTranslations("openForm");
  const tCommon = useTranslations("common");
  const tDash = useTranslations("dashboard");
  const dl = toDateLocale(useLocale());
  const router = useRouter();
  const toast = useToast();
  const { offlineFetch } = useOfflineQueue();
  const [startTime, setStartTime] = useState(
    toDatetimeLocal(initial?.startTime) || toDatetimeLocal(new Date())
  );
  const [grund, setGrund] = useState<OeffnenGrund | "">(
    (initial?.oeffnenGrund as OeffnenGrund) ?? ""
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showWarning, setShowWarning] = useState(false);

  async function doSave() {
    setSaving(true);
    setError("");
    try {
      const url = initial ? `/api/entries/${initial.id}` : "/api/entries";
      const init: RequestInit = {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "OEFFNEN", startTime: new Date(startTime).toISOString(), oeffnenGrund: grund, note: note.trim() || null }),
      };

      // Use offline-aware fetch for new entries (edits require online)
      const res = initial ? await fetch(url, init) : await offlineFetch(url, init);

      setSaving(false);

      // null = queued offline → navigate back
      if (res === null) {
        router.push(redirectTo ?? "/dashboard");
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || tCommon("savingError"));
        return;
      }
      toast.success(initial ? tDash("entryUpdated") : tDash("entrySaved"));
      router.push(redirectTo ?? "/dashboard");
    } catch {
      setSaving(false);
      setError(tCommon("networkError"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!grund) { setError(t("grundRequired")); return; }
    if (!note.trim()) { setError(t("commentRequired")); return; }
    if (sperrzeitUnbefristet || (sperrzeitEndetAt && new Date(sperrzeitEndetAt) > new Date())) {
      setShowWarning(true);
      return;
    }
    await doSave();
  }

  const isGesperrt = sperrzeitUnbefristet || !!(sperrzeitEndetAt && new Date(sperrzeitEndetAt) > new Date());

  const grundOptions = OEFFNEN_GRUENDE.map((g) => ({
    value: g,
    label: g === "REINIGUNG" ? t("grundReinigung")
         : g === "KEYHOLDER" ? t("grundKeyholder")
         : g === "NOTFALL" ? t("grundNotfall")
         : t("grundAnderes"),
    disabled: g === "REINIGUNG" && !reinigungErlaubt,
  }));

  return (
    <>
      {/* Sperrzeit-Warnung als Sheet */}
      <Sheet open={showWarning} onClose={() => setShowWarning(false)} title="">
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={28} className="flex-shrink-0 text-warn mt-0.5" />
            <div className="flex flex-col gap-1.5">
              <p className="font-bold text-foreground text-base leading-snug">
                {grund === "REINIGUNG" && reinigungErlaubt
                  ? t("modalTitleReinigung")
                  : t("modalTitle")}
              </p>
              <p className="text-sm text-foreground-muted">
                {grund === "REINIGUNG" && reinigungErlaubt
                  ? t("modalSubtextReinigung", { minutes: reinigungMaxMinuten })
                  : t("modalSubtext")}
              </p>
              <p className="text-xs text-sperrzeit font-semibold mt-1">
                {sperrzeitUnbefristet
                  ? t("modalLockedIndefinite")
                  : sperrzeitEndetAt
                    ? t("modalLockedUntil", { date: new Date(sperrzeitEndetAt).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ }) })
                    : null}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="primary" fullWidth onClick={() => setShowWarning(false)}>
              {t("modalStay")}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              loading={saving}
              onClick={() => { setShowWarning(false); doSave(); }}
            >
              {t("modalOpenAnyway")}
            </Button>
          </div>
        </div>
      </Sheet>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <RequiredHint />
        {/* Sperrzeit info banner */}
        {isGesperrt && (
          <Card variant="semantic" semantic="sperrzeit">
            <div className="flex items-start gap-2.5">
              <Lock size={16} className="flex-shrink-0 text-sperrzeit mt-0.5" />
              <div>
                <p className="text-sm font-bold text-sperrzeit-text">{t("lockedWarningTitle")}</p>
                <p className="text-xs text-sperrzeit mt-0.5">
                  {sperrzeitUnbefristet
                    ? t("lockedWarningTextIndefinite")
                    : t("lockedWarningText", { date: new Date(sperrzeitEndetAt!).toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ }) })}
                </p>
              </div>
            </div>
          </Card>
        )}

        <DateTimePicker
          label={tCommon("dateTime")}
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          required
        />

        <Select
          label={t("grundLabel")}
          value={grund}
          onChange={(e) => { setGrund(e.target.value as OeffnenGrund | ""); if (e.target.value) setError(""); }}
          required
          placeholder="–"
          options={grundOptions}
        />

        {grund === "REINIGUNG" && reinigungErlaubt && (
          <Card variant="semantic" semantic="inspect" padding="compact">
            <p className="text-xs text-inspect-text">
              {t("modalSubtextReinigung", { minutes: reinigungMaxMinuten })}
            </p>
          </Card>
        )}

        <Textarea
          label={tCommon("comment")}
          value={note}
          onChange={(e) => { setNote(e.target.value); if (e.target.value.trim()) setError(""); }}
          rows={4}
          required
          placeholder={t("commentPlaceholder")}
        />

        <FormError message={error} />

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
          <Button type="button" variant="secondary" fullWidth onClick={() => router.push("/dashboard")}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" variant="semantic" semantic="unlock" fullWidth loading={saving}>
            {initial ? tCommon("update") : t("saveBtn")}
          </Button>
        </div>
      </form>
    </>
  );
}
