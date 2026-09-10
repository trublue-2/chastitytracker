"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import DetailField from "@/app/components/DetailField";
import FormError from "@/app/components/FormError";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { OFFENSE_STATEMENT_MAX_LENGTH } from "@/lib/constants";
import type { PresentedMessage } from "@/lib/messagePresenter";

/**
 * Was der Träger zu einem festgestellten Vergehen zu sagen hat — im Posteingang, an der Meldung,
 * mit der er es erfährt.
 *
 * HIER und nicht an einer Vergehens-Liste: eine solche Liste hat der Träger nicht. Sein
 * Dashboard-Block zeigt offene STRAFEN (`openPenaltiesOf`), also Beurteiltes; ein festgestelltes,
 * noch unbeurteiltes Vergehen erfährt er ausschliesslich als Nachricht. Der Ort, an dem er es liest,
 * ist damit auch der einzige, an dem er antworten kann.
 *
 * Ohne Schreibrecht bleibt der Text als Zitat stehen — für ihn nach dem Urteil, für die
 * Keyholderin immer. Sie urteilt darüber, sie verfasst ihn nicht.
 */
export default function OffenseStatementField({
  statement,
  onSaved,
}: {
  statement: NonNullable<PresentedMessage["statement"]>;
  /** Der gespeicherte Text (`null` = zurückgenommen). Die Liste schreibt ihn in ihre Zeile, statt
   *  die Seite neu zu holen — ein Neuladen klappte das Panel zu, in dem er gerade geschrieben hat. */
  onSaved: (text: string | null) => void;
}) {
  const t = useTranslations("messages");
  const apiError = useApiError();
  const [text, setText] = useState(statement.text ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** `value` explizit statt aus dem Closure: der Zurücknehmen-Knopf ruft mit `""` auf, und ein
   *  `setText("")` davor wäre beim Absenden noch nicht angekommen — gespeichert würde der ALTE Text. */
  async function save(value: string = text) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/offense-statement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refId: statement.refId, offenseType: statement.offenseType, text: value }),
      });
      if (!res.ok) {
        // Der Text bleibt STEHEN. Der häufigste Fehlschlag hier ist ein Urteil, das ihn beim
        // Schreiben überholt hat (409) — sein Text zu verwerfen wäre die zweite schlechte Nachricht
        // nach der ersten.
        setError(apiError(await parseApiErrorCode(res)));
        return;
      }
      setEditing(false);
      onSaved(value.trim() || null);
    } catch {
      setError(apiError(null));
    } finally {
      setSaving(false);
    }
  }

  const hasText = Boolean(statement.text);

  if (!statement.editable || !editing) {
    return (
      <div className="pl-4 flex flex-col gap-2 items-start">
        <DetailField label={t("statementLabel")}>
          {hasText ? (
            <p className="text-sm text-foreground-muted whitespace-pre-wrap border-l-2 border-border pl-3">
              {statement.text}
            </p>
          ) : (
            <p className="text-sm text-foreground-faint italic">{t("statementEmpty")}</p>
          )}
        </DetailField>
        {statement.editable && (
          <Button variant="ghost" size="sm" onClick={() => { setText(statement.text ?? ""); setEditing(true); }}>
            {hasText ? t("statementEdit") : t("statementWrite")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="pl-4 flex flex-col gap-2">
      <DetailField label={t("statementLabel")}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={OFFENSE_STATEMENT_MAX_LENGTH}
          placeholder={t("statementPlaceholder")}
          className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground transition resize-none"
        />
      </DetailField>
      {error && <FormError message={error} />}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void save()} loading={saving}>{t("statementSave")}</Button>
        <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setError(null); }}>
          {t("statementCancel")}
        </Button>
        {/* Leeren nimmt sie zurück — das ist die Rückseite von „änderbar", und ohne sie bliebe eine
            im Ärger geschriebene Zeile für immer stehen. */}
        {hasText && (
          <button
            type="button"
            onClick={() => { setText(""); void save(""); }}
            className="text-xs text-foreground-faint hover:text-warn transition ml-auto"
          >
            {t("statementDelete")}
          </button>
        )}
      </div>
    </div>
  );
}
