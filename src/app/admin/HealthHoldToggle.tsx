"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Input from "@/app/components/Input";
import Button from "@/app/components/Button";
import { useSettingsSave } from "@/app/hooks/useUserSettingsSave";
import { busyDimCls } from "@/app/components/inputStyles";
import { formatDateTime, toDateLocale } from "@/lib/utils";

/**
 * Die Gesundheitspause EINES Trägers — setzen und aufheben.
 *
 * Bewusst KEIN Schalter, obwohl der Abschnitt in einer Reihe mit lauter Schaltern steht: das
 * Einschalten verlangt einen Grund. Ein Toggle, der beim Umlegen zuerst nach etwas fragt, ist
 * entweder ein Toggle, der nicht schaltet, oder einer, der eine Absage vom Server einfängt — beides
 * ist eine schlechtere Bedienung als die zwei Zustände, die es hier tatsächlich gibt.
 *
 * Der laufende Halt zeigt seinen Grund und seit wann. Beides ist die Antwort auf die Frage, die sich
 * die Keyholderin in einer Woche stellt, wenn sie eine versäumte Kontrolle sieht.
 */
export default function HealthHoldToggle({
  userId,
  initialActive,
  initialReason,
  initialSince,
}: {
  userId: string;
  initialActive: boolean;
  initialReason: string | null;
  /** Beginn des laufenden Halts als ISO-String; `null`, wenn keiner läuft. */
  initialSince: string | null;
}) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const { saving, save } = useSettingsSave(`/api/admin/users/${userId}/health-hold`, { refresh: false });
  const [active, setActive] = useState(initialActive);
  const [reason, setReason] = useState(initialReason ?? "");
  const [since, setSince] = useState(initialSince);

  async function start() {
    // Die Schranke steht ZUSÄTZLICH im Service (und im MCP): hier spart sie dem Benutzer den
    // Rundgang zum Server, dort ist sie die Regel. Nur hier wäre sie eine Bitte.
    if (!reason.trim()) return;
    if (await save({ active: true, reason })) {
      setActive(true);
      setSince(new Date().toISOString());
    }
  }

  async function end() {
    if (await save({ active: false })) {
      setActive(false);
      setSince(null);
      setReason("");
    }
  }

  if (active) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground">{reason}</p>
        {since && (
          <p className="text-neben text-foreground-muted">
            {t("healthHoldSince", { since: formatDateTime(new Date(since), toDateLocale(locale)) })}
          </p>
        )}
        <Button variant="secondary" loading={saving} onClick={end} className="self-start">
          {t("healthHoldEnd")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        label={t("healthHoldReasonLabel")}
        hint={t("healthHoldReasonHint")}
        value={reason}
        disabled={saving}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button
        loading={saving}
        // `aria-disabled` statt `disabled`: ein leeres Feld darf den Knopf nicht aus dem Fokus
        // nehmen, während die Keyholderin gerade tippt. Die Schranke sitzt im Handler.
        aria-disabled={!reason.trim()}
        onClick={start}
        className={`self-start ${busyDimCls}`}
      >
        {t("healthHoldStart")}
      </Button>
    </div>
  );
}
