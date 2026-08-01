"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import HelpLink from "@/app/components/HelpLink";
import { mcpHelpUrl, toLocale } from "@/lib/constants";
import { KEYHOLDER_TEMPLATE } from "@/lib/mcp/keyholderTemplate";

/** Free-text rules the human keyholder sets for the AI keyholder acting over the MCP.
 *  Soft guidance — exposed to the agent via keyholder_dashboard.keyholderInstructions, not enforced. */
export default function KeyholderInstructionsForm({ userId, initial }: { userId: string; initial: string }) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcpKeyholderInstructions: text }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      router.refresh();
    } catch {
      setError(t("keyholderInstructionsError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSaved(false); }}
        rows={6}
        placeholder={t("keyholderInstructionsPlaceholder")}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} loading={saving} disabled={text === initial}>
          {t("keyholderInstructionsSave")}
        </Button>
        {/* Vorlage nur anbieten, solange nichts dasteht — sie ersetzt den ganzen Text und würde
            sonst ein gewachsenes Regelwerk mit einem Fehlklick überschreiben. */}
        {!text.trim() && (
          <Button variant="secondary" onClick={() => { setText(KEYHOLDER_TEMPLATE[toLocale(locale)]); setSaved(false); }}>
            {t("keyholderInstructionsTemplateInsert")}
          </Button>
        )}
        {saved && <span className="text-xs text-ok">{t("keyholderInstructionsSaved")}</span>}
      </div>
      <FormError message={error} variant="compact" />
      <HelpLink href={mcpHelpUrl(locale)} label={t("keyholderInstructionsHelp")} />
    </div>
  );
}
