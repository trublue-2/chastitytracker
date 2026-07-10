"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Droplets } from "lucide-react";
import { useTranslations } from "next-intl";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/utils";
import { ORGASMUS_ANFORDERUNG_ARTEN, orgasmusAnforderungArtLabel } from "@/lib/constants";
import type { ResolvedReason } from "@/lib/reasonsService";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import DateTimePicker from "@/app/components/DateTimePicker";
import FormError from "@/app/components/FormError";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Checkbox from "@/app/components/Checkbox";
import Button from "@/app/components/Button";
import { parseApiError } from "@/lib/apiClient";

export default function OrgasmusAnforderungForm({ userId, artOptions, tz, nowDefault }: { userId: string; artOptions: ResolvedReason[]; tz: string; nowDefault: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const target = `/admin/users/${userId}/aktionen`;

  const [art, setArt] = useState<(typeof ORGASMUS_ANFORDERUNG_ARTEN)[number]>("ANWEISUNG");
  const [beginntAt, setBeginntAt] = useState(nowDefault);
  // Derive the +24h default from the SERVER-provided `nowDefault` (not client `Date.now()`), so the
  // initializer is deterministic across SSR + hydration.
  const [endetAt, setEndetAt] = useState(() => toDatetimeLocal(new Date(fromDatetimeLocal(nowDefault, tz).getTime() + 24 * 60 * 60 * 1000), tz));
  const [vorgegebeneArt, setVorgegebeneArt] = useState("");
  const [oeffnenErlaubt, setOeffnenErlaubt] = useState(false);
  const [nachricht, setNachricht] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const modeOptions = ORGASMUS_ANFORDERUNG_ARTEN.map((a) => ({
    value: a,
    label: orgasmusAnforderungArtLabel(a, t),
  }));
  const vorgabeOptions = [
    { value: "", label: t("orgasmReqArtAny") },
    ...artOptions.map((r) => ({ value: r.code, label: r.label })),
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (new Date(endetAt) <= new Date(beginntAt)) {
      setError(t("orgasmReqEndAfterStart"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/orgasmus-anforderung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          art,
          beginntAt: fromDatetimeLocal(beginntAt, tz).toISOString(),
          endetAt: fromDatetimeLocal(endetAt, tz).toISOString(),
          vorgegebeneArt: vorgegebeneArt || undefined,
          oeffnenErlaubt,
          nachricht: nachricht.trim() || undefined,
        }),
      });
      if (res.ok) router.push(target);
      else setError(await parseApiError(res, tc("error")));
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminActionFormShell
      userId={userId}
      backLabel={t("aktionen")}
      icon={<Droplets size={20} strokeWidth={2} />}
      iconBg="var(--color-orgasm-bg)"
      iconColor="var(--color-orgasm)"
      title={t("requestOrgasm")}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select
          label={t("orgasmReqMode")}
          options={modeOptions}
          value={art}
          onChange={(e) => setArt(e.target.value as (typeof ORGASMUS_ANFORDERUNG_ARTEN)[number])}
        />
        <DateTimePicker
          label={t("orgasmReqStart")}
          value={beginntAt}
          onChange={(e) => setBeginntAt(e.target.value)}
        />
        <DateTimePicker
          label={t("orgasmReqEnd")}
          value={endetAt}
          onChange={(e) => setEndetAt(e.target.value)}
        />
        <Select
          label={t("orgasmReqArt")}
          options={vorgabeOptions}
          value={vorgegebeneArt}
          onChange={(e) => setVorgegebeneArt(e.target.value)}
          hint={t("orgasmReqArtHint")}
        />
        <div className="flex flex-col gap-1">
          <Checkbox
            label={t("orgasmReqOpenAllowedLabel")}
            checked={oeffnenErlaubt}
            onChange={(e) => setOeffnenErlaubt(e.target.checked)}
          />
          <span className="text-xs text-foreground-faint pl-8">{t("orgasmReqOpenAllowedHint")}</span>
        </div>
        <Textarea
          label={t("orgasmReqMessage")}
          value={nachricht}
          onChange={(e) => setNachricht(e.target.value)}
          rows={2}
        />

        <FormError message={error} variant="compact" />

        <Button
          type="submit"
          variant="semantic"
          semantic="orgasm"
          fullWidth
          loading={saving}
          icon={<Droplets size={16} />}
        >
          {saving ? t("sending") : t("orgasmReqSubmit")}
        </Button>
      </form>
    </AdminActionFormShell>
  );
}
