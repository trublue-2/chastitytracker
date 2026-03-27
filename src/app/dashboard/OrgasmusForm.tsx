"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toDatetimeLocal } from "@/lib/utils";
import { useTranslations } from "next-intl";

const ARTEN = ["Orgasmus", "ruinierter Orgasmus", "feuchter Traum"];

const SUB_ARTEN: Record<string, string[]> = {
  "Orgasmus": ["Masturbation", "Geschlechtsverkehr", "durch andere Person", "durch Technik"],
  "ruinierter Orgasmus": ["Verschlossen", "Anal"],
};

function parseArt(stored: string | null | undefined): { art: string; subArt: string } {
  if (!stored) return { art: ARTEN[0], subArt: "" };
  const sep = stored.indexOf(" – ");
  if (sep === -1) return { art: stored, subArt: "" };
  return { art: stored.slice(0, sep), subArt: stored.slice(sep + 3) };
}

interface Props {
  initial?: { id: string; startTime: string; note?: string | null; orgasmusArt?: string | null };
}

const inputCls = "w-full bg-surface-raised border border-border rounded-xl px-4 py-3.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted focus:border-transparent transition";

export default function OrgasmusForm({ initial }: Props) {
  const t = useTranslations("orgasmForm");
  const tCommon = useTranslations("common");

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
  const router = useRouter();
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

    const res = await fetch(
      initial ? `/api/entries/${initial.id}` : "/api/entries",
      {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ORGASMUS",
          startTime: new Date(startTime).toISOString(),
          orgasmusArt: subArt ? `${art} – ${subArt}` : art,
          note: note || null,
        }),
      }
    );

    setSaving(false);
    if (!res.ok) { setError(tCommon("savingError")); return; }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">{tCommon("dateTimeRequired")}</label>
        <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required className={inputCls} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">{t("type")} *</label>
        <select value={art} onChange={(e) => handleArtChange(e.target.value)} required className={`${inputCls}`}>
          {ARTEN.map((a) => <option key={a} value={a}>{ARTEN_LABELS[a] ?? a}</option>)}
        </select>
      </div>

      {SUB_ARTEN[art] && (
        <div>
          <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">{t("subType")}</label>
          <select value={subArt} onChange={(e) => setSubArt(e.target.value)} className={`${inputCls}`}>
            <option value="">{t("noSubType")}</option>
            {SUB_ARTEN[art].map((s) => <option key={s} value={s}>{SUB_ARTEN_LABELS[s] ?? s}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-foreground-faint uppercase tracking-wider mb-2">{tCommon("commentOptional")}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          placeholder="Bemerkung…"
          className={`${inputCls} resize-none`} />
      </div>

      {error && <p className="text-sm text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3">{error}</p>}

      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
        <button type="button" onClick={() => router.push("/dashboard")}
          className="flex-1 text-sm text-foreground-muted border border-border rounded-xl py-3.5 hover:bg-surface-raised active:scale-[0.98] transition-all">
          {tCommon("cancel")}
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 bg-[var(--color-orgasm)] text-white text-base font-semibold py-3.5 rounded-xl hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition-all">
          {saving ? tCommon("saving") : initial ? tCommon("update") : t("saveBtn")}
        </button>
      </div>
    </form>
  );
}
