"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import FormError from "@/app/components/FormError";
import { cardActionCls } from "@/app/admin/WithdrawButton";
import { useActionPatch } from "@/app/hooks/useActionPatch";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";

/**
 * Eine zurückgezogene Aufgabe endgültig löschen — der Weg, die Liste sauber zu halten.
 *
 * Steht an derselben Stelle wie {@link WithdrawButton} und teilt sich mit ihm seine Klassenkette
 * ({@link cardActionCls}): es ist die Aktion, die NACH dem Rückzug an dieser Karte übrigbleibt, und
 * die beiden sitzen unmittelbar untereinander. Gäbe es die Kette zweimal, liefe eine Stiländerung an
 * der einen der anderen davon. Gleichzeitig gibt es sie nie — was offen ist, wird zurückgezogen, was
 * zurückgezogen ist, wird gelöscht.
 *
 * MIT RÜCKFRAGE, anders als der Rückzug: der ist umkehrbar (die Aufgabe bleibt in der Historie
 * stehen), das hier ist es nicht. Der Dialog bleibt WÄHREND des Löschens offen (`loading`) — sonst
 * verschwände er, und eine Fehlermeldung erschiene an einer Stelle, an der gerade niemand hinsieht.
 *
 * Der Fehler wird AUFGELÖST gezeigt (`useApiError`), nicht als allgemeines „Speichern fehlgeschlagen":
 * die Route hat genau eine Absage, die der Nutzer verstehen und beheben kann — „nur eine
 * zurückgezogene Aufgabe lässt sich löschen", wenn die Liste veraltet ist.
 */
export default function DeleteTaskButton({ id }: { id: string }) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const { saving, run } = useActionPatch();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");

  async function handle() {
    setError("");
    const res = await run(`/api/admin/tasks/${id}`, undefined, "DELETE");
    if (!res) setError(tc("networkError"));
    else if (!res.ok) setError(apiError(await parseApiErrorCode(res)));
    // Der Dialog schliesst erst hier — bei Erfolg lädt `run` die Seite ohnehin neu, im Fehlerfall
    // steht die Meldung dann an der Karte, auf die der Blick zurückfällt.
    setAsking(false);
  }

  return (
    <>
      <button
        onClick={() => setAsking(true)}
        disabled={saving}
        title={tc("delete")}
        className={cardActionCls("neutral")}
      >
        <Trash2 size={16} strokeWidth={2.5} />
        {tc("delete")}
      </button>
      <ConfirmDialog
        open={asking}
        title={t("deleteTaskConfirmTitle")}
        message={t("deleteTaskConfirmText")}
        icon={<Trash2 size={20} style={{ color: "var(--color-warn)" }} />}
        confirmLabel={tc("delete")}
        danger
        loading={saving}
        onConfirm={handle}
        onCancel={() => setAsking(false)}
      />
      <FormError message={error} />
    </>
  );
}
