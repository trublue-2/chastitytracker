"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Droplets } from "lucide-react";
import { useTranslations } from "next-intl";
import { toDatetimeLocal } from "@/lib/utils";
import { ORGASMUS_ARTEN, orgasmusArtLabel, ORGASMUS_ANFORDERUNG_ARTEN, orgasmusAnforderungArtLabel } from "@/lib/constants";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import DateTimePicker from "@/app/components/DateTimePicker";
import FormError from "@/app/components/FormError";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Checkbox from "@/app/components/Checkbox";
import Button from "@/app/components/Button";

export default function OrgasmusAnforderungForm({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tOrgasm = useTranslations("orgasmForm");
  const router = useRouter();
  const target = `/admin/users/${userId}/aktionen`;

  const [art, setArt] = useState<(typeof ORGASMUS_ANFORDERUNG_ARTEN)[number]>("ANWEISUNG");
  const [beginntAt, setBeginntAt] = useState(() => toDatetimeLocal(new Date()));
  const [endetAt, setEndetAt] = useState(() => toDatetimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [vorgegebeneArt, setVorgegebeneArt] = useState("");
  const [oeffnenErlaubt, setOeffnenErlaubt] = useState(false);
  const [nachricht, setNachricht] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const artOptions = ORGASMUS_ANFORDERUNG_ARTEN.map((a) => ({
    value: a,
    label: orgasmusAnforderungArtLabel(a, t),
  }));
  const vorgabeOptions = [
    { value: "", label: t("orgasmReqArtAny") },
    ...ORGASMUS_ARTEN.map((a) => ({ value: a, label: orgasmusArtLabel(a, tOrgasm) })),
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
          beginntAt: new Date(beginntAt).toISOString(),
          endetAt: new Date(endetAt).toISOString(),
          vorgegebeneArt: vorgegebeneArt || undefined,
          oeffnenErlaubt,
          nachricht: nachricht.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) router.push(target);
      else setError(data.error || tc("error"));
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
          options={artOptions}
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
