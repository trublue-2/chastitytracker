"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toDatetimeLocal } from "@/lib/utils";
import { useTranslations } from "next-intl";
import FormError from "@/app/components/FormError";
import RequiredHint from "@/app/components/RequiredHint";
import DateTimePicker from "@/app/components/DateTimePicker";
import Select from "@/app/components/Select";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import { ORGASMUS_ARTEN } from "@/lib/constants";

const SUB_ARTEN: Record<string, string[]> = {
  "Orgasmus": ["Masturbation", "Geschlechtsverkehr", "durch andere Person", "durch Technik"],
  "ruinierter Orgasmus": ["Verschlossen", "Anal"],
};

function parseArt(stored: string | null | undefined): { art: string; subArt: string } {
  if (!stored) return { art: ORGASMUS_ARTEN[0], subArt: "" };
  const sep = stored.indexOf(" – ");
  if (sep === -1) return { art: stored, subArt: "" };
  return { art: stored.slice(0, sep), subArt: stored.slice(sep + 3) };
}

interface Props {
  initial?: { id: string; startTime: string; note?: string | null; orgasmusArt?: string | null };
  redirectTo?: string;
}

export default function OrgasmusForm({ initial, redirectTo }: Props) {
  const t = useTranslations("orgasmForm");
  const tCommon = useTranslations("common");
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const { offlineFetch } = useOfflineQueue();

  const ARTEN_LABELS: Record<string, string> = {
    "Orgasmus":          t("artOrgasmus"),
    "ruinierter Orgasmus": t("artRuiniert"),
    "feuchter Traum":    t("artTraum"),
  };
  const SUB_ARTEN_LABELS: Record<string, string> = {
    "Masturbation":       t("subMasturbation"),
    "Geschlechtsverkehr": t("subGeschlecht"),
    "durch andere Person":t("subPerson"),
    "durch Technik":      t("subTechnik"),
    "Verschlossen":       t("subVerschlossen"),
    "Anal":               t("subAnal"),
  };

  const parsed = parseArt(initial?.orgasmusArt);
  const [startTime, setStartTime] = useState(
    toDatetimeLocal(initial?.startTime) || toDatetimeLocal(new Date())
  );
  const [art, setArt] = useState(parsed.art);
  const [subArt, setSubArt] = useState(parsed.subArt);
  const [note, setNote] = useState(initial?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleArtChange(newArt: string) {
    setArt(newArt);
    setSubArt("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const url = initial ? `/api/entries/${initial.id}` : "/api/entries";
      const init: RequestInit = {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ORGASMUS",
          startTime: new Date(startTime).toISOString(),
          orgasmusArt: subArt ? `${art} – ${subArt}` : art,
          note: note || null,
        }),
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

  const artOptions = ORGASMUS_ARTEN.map(a => ({ value: a, label: ARTEN_LABELS[a] ?? a }));
  const subArtOptions = (SUB_ARTEN[art] ?? []).map(s => ({ value: s, label: SUB_ARTEN_LABELS[s] ?? s }));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <RequiredHint />
      <DateTimePicker
        label={tCommon("dateTime")}
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        required
      />

      <Select
        label={t("type")}
        value={art}
        onChange={(e) => handleArtChange(e.target.value)}
        required
        options={artOptions}
      />

      {subArtOptions.length > 0 && (
        <Select
          label={t("subType")}
          value={subArt}
          onChange={(e) => setSubArt(e.target.value)}
          placeholder={t("noSubType")}
          options={subArtOptions}
        />
      )}

      <Textarea
        label={tCommon("commentOptional")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />

      <FormError message={error} />

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
        <Button type="button" variant="secondary" fullWidth onClick={() => router.push("/dashboard")}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="semantic" semantic="orgasm" fullWidth loading={saving}>
          {initial ? tCommon("update") : t("saveBtn")}
        </Button>
      </div>
    </form>
  );
}
