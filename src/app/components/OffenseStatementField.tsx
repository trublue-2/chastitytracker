"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import QuotedField from "@/app/components/QuotedField";
import Textarea from "@/app/components/Textarea";
import { fetchWithTimeout, parseApiErrorCode } from "@/lib/apiClient";
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
  const tc = useTranslations("common");
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
      const res = await fetchWithTimeout("/api/offense-statement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refId: statement.refId, text: value }),
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
  const open = statement.editable && editing;

  return (
    <div className={`pl-4 flex flex-col gap-2${open ? "" : " items-start"}`}>
      {open ? (
        <Textarea
          label={t("statementLabel")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={OFFENSE_STATEMENT_MAX_LENGTH}
          placeholder={t("statementPlaceholder")}
          error={error}
        />
      ) : (
        <QuotedField label={t("statementLabel")} text={statement.text} empty={t("statementEmpty")} />
      )}

      {open ? (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void save()} loading={saving}>{tc("save")}</Button>
          <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setError(null); }}>
            {tc("cancel")}
          </Button>
          {/* Leeren nimmt sie zurück — das ist die Rückseite von „änderbar", und ohne sie bliebe eine
              im Ärger geschriebene Zeile für immer stehen. */}
          {hasText && (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setText(""); void save(""); }}>
              {t("statementDelete")}
            </Button>
          )}
        </div>
      ) : (
        statement.editable && (
          <Button variant="ghost" size="sm" onClick={() => { setText(statement.text ?? ""); setEditing(true); }}>
            {hasText ? t("statementEdit") : t("statementWrite")}
          </Button>
        )
      )}
    </div>
  );
}
