"use client";

import { useEffect, useRef, useState } from "react";
import { BellRing, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import useToast from "@/app/hooks/useToast";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";
import { INSPECTION_CODE_PUSH_COOLDOWN_MS } from "@/lib/constants";

/**
 * Schickt den Code der laufenden Kontrolle noch einmal als Meldung aufs Gerät des Subs.
 *
 * Der Knopf steht neben dem Code im Erfassungs-Formular, weil dort die Kamera ist: das Handy kann
 * seinen eigenen Bildschirm nicht abfotografieren, also braucht der Code einen zweiten (Smartwatch)
 * — und der ist weg, sobald die Meldung gesichtet oder von der nächsten verdrängt wurde. Warum die
 * wiederholte Meldung nur aus dem Code besteht, steht an `buildInspectionCodePush`.
 *
 * Nach JEDEM Versuch sperrt sich der Knopf für dieselbe Frist, mit der die Route begrenzt
 * ({@link INSPECTION_CODE_PUSH_COOLDOWN_MS}) — auch nach einem gescheiterten. Der Zähler auf dem
 * Server zählt nämlich den Versuch, nicht den Erfolg: sperrte sich der Knopf nur nach dem Senden,
 * bekäme genau der Nutzer, dem gerade „keine Meldungen eingerichtet" gemeldet wurde, auf seinen
 * zweiten Druck ein „zu schnell hintereinander" — eine Absage, die mit seinem Problem nichts zu tun
 * hat und ihn von der Ursache wegführt.
 *
 * Erfolg meldet die Meldung auf dem Gerät; ein Toast obendrauf wäre die zweite Bestätigung derselben
 * Sache. Deshalb unterscheiden „gesendet" und „gesperrt" sich nur in der Beschriftung — gemeldet
 * werden nur Fehler.
 */
type Status = "idle" | "saving" | "sent" | "cooling";

export default function InspectionCodePushButton({ controlId }: { controlId: string }) {
  const t = useTranslations("inspectionForm");
  const toast = useToast();
  const apiError = useApiError();
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function handle() {
    setStatus("saving");
    // Vorbelegt mit „gesperrt": jeder Ausgang ausser dem Erfolg landet hier, auch der Abbruch
    // unterwegs — ob die Anfrage den Server erreicht hat, weiss der Browser dann nicht, und die
    // vorsichtige Annahme ist die, die keine falsche Absage produziert.
    let next: Status = "cooling";
    try {
      const res = await fetch(`/api/kontrollen/${controlId}/code-push`, { method: "POST" });
      if (res.ok) next = "sent";
      else toast.error(apiError(await parseApiErrorCode(res)));
    } catch {
      toast.error(apiError(null));
    }
    setStatus(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), INSPECTION_CODE_PUSH_COOLDOWN_MS);
  }

  const sent = status === "sent";
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handle}
      loading={status === "saving"}
      disabled={status !== "idle"}
      icon={sent ? <Check size={16} strokeWidth={2.5} /> : <BellRing size={16} strokeWidth={2.5} />}
      title={t("resendCodeHint")}
      className="ml-auto"
    >
      {sent ? t("resendCodeDone") : t("resendCode")}
    </Button>
  );
}
