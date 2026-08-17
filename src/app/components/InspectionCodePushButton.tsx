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
 * wiederholte Meldung aus Code und Uhrzeit besteht und aus sonst nichts, steht an
 * `buildInspectionCodePush`.
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

/**
 * WOHER der Code kommt — und das ist der ganze Unterschied zwischen den beiden Fällen.
 *
 * Bei einer ANGEFORDERTEN Kontrolle nennt der Knopf nur die Anforderung; welcher Code darin steht,
 * sagt der Server. Bei einer SELBSTKONTROLLE gibt es keine Anforderung, der Code ist beim Öffnen des
 * Formulars gewürfelt (oder gerade getippt) und existiert nur hier — dann muss er mitgeschickt
 * werden.
 *
 * Bewusst ein Entweder-oder und nicht zwei optionale Felder: „beides gesetzt" hat keine sinnvolle
 * Bedeutung, und mit zwei `?`-Feldern wäre „keins gesetzt" ein Knopf, der ins Leere drückt.
 */
type CodeSource = { controlId: string; code?: never } | { code: string; controlId?: never };

export default function InspectionCodePushButton({
  controlId,
  code,
  categoryId = null,
  disabled = false,
}: CodeSource & {
  /** Das ZIEL der Selbstkontrolle (Trage-Kategorie), damit die Meldung auf dasselbe Formular führt,
   *  auf dem der Sub gerade steht. Ohne es landet eine Trage-Kontrolle beim Antippen auf dem
   *  KG-Formular, und das eingereichte Foto beantwortet eine andere Kontrolle als die gemeinte. Beim
   *  angeforderten Code kennt der Server das Ziel selbst (es steht an der Anforderung). */
  categoryId?: string | null;
  /** Der Code taugt gerade nicht (halb getippt). Bewusst SPERREN statt den Knopf zu entfernen: ein
   *  ausgebauter Knopf nimmt seine Sperrfrist mit ins Grab, und der nächste Druck holt sich den
   *  429 vom Server — genau die Absage, gegen die die Sperre gebaut ist. */
  disabled?: boolean;
}) {
  const t = useTranslations("inspectionForm");
  const toast = useToast();
  const apiError = useApiError();
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Ändert sich der Code, gilt das „Gesendet" ihm nicht mehr — auf der Uhr steht der ALTE. Der Haken
  // fällt weg, die Sperrfrist bleibt: sie gehört dem Knopfdruck, nicht dem Code. Wer den Code
  // korrigiert, weil er sich vertippt hat, soll nicht die Bestätigung für die falsche Zahl lesen —
  // und trotzdem nicht in den 429 laufen.
  useEffect(() => {
    setStatus((s) => (s === "sent" ? "cooling" : s));
  }, [code]);

  async function handle() {
    setStatus("saving");
    // Vorbelegt mit „gesperrt": jeder Ausgang ausser dem Erfolg landet hier, auch der Abbruch
    // unterwegs — ob die Anfrage den Server erreicht hat, weiss der Browser dann nicht, und die
    // vorsichtige Annahme ist die, die keine falsche Absage produziert.
    let next: Status = "cooling";
    try {
      // Die Anforderung nennen, wo es eine gibt — sonst den Code selbst. Beide Routen teilen sich
      // Sperrfrist und Zähler; für den Knopf ist es derselbe Druck.
      const res = controlId
        ? await fetch(`/api/kontrollen/${controlId}/code-push`, { method: "POST" })
        : await fetch("/api/kontrollen/code-push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Das Ziel geht MIT: der Server kennt es hier nicht, es steht in keiner Anforderung.
            body: JSON.stringify({ code, categoryId }),
          });
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
      disabled={disabled || status !== "idle"}
      icon={sent ? <Check size={16} strokeWidth={2.5} /> : <BellRing size={16} strokeWidth={2.5} />}
      title={t("resendCodeHint")}
      className="ml-auto"
    >
      {sent ? t("resendCodeDone") : t("resendCode")}
    </Button>
  );
}
