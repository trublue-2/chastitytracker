"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import QuotedField from "@/app/components/QuotedField";
import Textarea from "@/app/components/Textarea";
import { fetchWithTimeout, parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { OFFENSE_STATEMENT_MAX_LENGTH } from "@/lib/constants";
import type { StatementView } from "@/lib/offenseStatementService";

/**
 * Was der Träger zu einem festgestellten Vergehen zu sagen hat — an zwei Orten: an der Meldung im
 * Posteingang, mit der er es erfährt, und an der Karte des Vergehens in seinem Strafen-Block.
 *
 * Ohne Schreibrecht bleibt der Text als Zitat stehen — für ihn nach dem Urteil, für die
 * Keyholderin immer. Sie urteilt darüber, sie verfasst ihn nicht.
 */
export default function OffenseStatementField({
  statement,
  onSaved,
  className = "",
  label,
}: {
  statement: StatementView;
  /** Der gespeicherte Text (`null` = zurückgenommen). Die Posteingangs-Liste schreibt ihn in ihre
   *  Zeile, statt die Seite neu zu holen — ein Neuladen klappte das Panel zu, in dem er gerade
   *  geschrieben hat. Ohne Rückruf (Dashboard-Karte) wird die Seite neu geholt. */
  onSaved?: (text: string | null) => void;
  /** Einzug des Felds — im Posteingang auf der Titelkante der Zeile, auf der Karte bündig. */
  className?: string;
  /** Beschriftung — Default „Deine Stellungnahme"; die Keyholderin liest „Seine Stellungnahme". */
  label?: string;
}) {
  const t = useTranslations("messages");
  const tc = useTranslations("common");
  const router = useRouter();
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
      if (onSaved) onSaved(value.trim() || null);
      else router.refresh();
    } catch {
      setError(apiError(null));
    } finally {
      setSaving(false);
    }
  }

  const hasText = Boolean(statement.text);
  const open = statement.editable && editing;

  return (
    <div className={`${className} flex flex-col gap-2${open ? "" : " items-start"}`}>
      {open ? (
        <Textarea
          label={label ?? t("statementLabel")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={OFFENSE_STATEMENT_MAX_LENGTH}
          placeholder={t("statementPlaceholder")}
          error={error}
        />
      ) : (
        <QuotedField label={label ?? t("statementLabel")} text={statement.text} empty={t("statementEmpty")} />
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
