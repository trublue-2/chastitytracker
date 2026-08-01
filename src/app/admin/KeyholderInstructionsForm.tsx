"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Card from "@/app/components/Card";
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
  const [showTemplate, setShowTemplate] = useState(false);
  const templatePanelId = useId();
  const template = KEYHOLDER_TEMPLATE[toLocale(locale)];
  const hasRules = text.trim() !== "";

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
        {/* Ansehen geht immer — wer schon Regeln hat, soll die fehlenden Abschnitte vergleichen
            können. EINGEFÜGT wird nur ins leere Feld: die Vorlage ersetzt den ganzen Text und
            würde sonst ein gewachsenes Regelwerk mit einem Fehlklick überschreiben. */}
        {/* Nicht ExpandRow: das ist die LISTEN-Zeile der Einstellungen (volle Breite, eigener
            px-5-Innenabstand, Hover über die ganze Zeile) und säße hier im bereits gepolsterten
            Formular-Körper doppelt eingerückt. Übernommen ist von dort, was zählt: aria-expanded
            + aria-controls auf dem Auslöser. */}
        <Button
          variant="secondary"
          aria-expanded={showTemplate}
          aria-controls={showTemplate ? templatePanelId : undefined}
          onClick={() => setShowTemplate(!showTemplate)}
        >
          {t(showTemplate ? "keyholderInstructionsTemplateHide" : "keyholderInstructionsTemplateShow")}
        </Button>
        {saved && <span className="text-xs text-ok">{t("keyholderInstructionsSaved")}</span>}
      </div>
      {showTemplate && (
        <Card id={templatePanelId} variant="outlined" padding="compact" className="flex flex-col gap-3">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-foreground-muted">{template}</pre>
          {hasRules ? (
            <p className="text-xs text-foreground-faint">{t("keyholderInstructionsTemplateKept")}</p>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => { setText(template); setShowTemplate(false); setSaved(false); }}>
              {t("keyholderInstructionsTemplateInsert")}
            </Button>
          )}
        </Card>
      )}
      <FormError message={error} variant="compact" />
      <HelpLink href={mcpHelpUrl(locale)} label={t("keyholderInstructionsHelp")} />
    </div>
  );
}
