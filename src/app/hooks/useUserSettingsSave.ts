"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";

/**
 * Geteilter Saver für die Admin-Settings-Toggles (PATCH /api/admin/users/[id]).
 * Wertet die Antwort aus: ein abgelehnter Patch (z.B. ungültige HH:MM-Uhrzeit) zeigt seinen
 * stabilen Fehler-Code als Toast, statt den Wert beim `router.refresh()` stumm zurückspringen
 * zu lassen. `saving` deaktiviert die Eingaben, solange der Request läuft.
 *
 * `save` liefert `true`, wenn der Server den Patch übernommen hat — Aufrufer können darauf ihre
 * lokale Eingabe zurücksetzen (siehe TimeInput).
 */
export function useUserSettingsSave(userId: string) {
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const tc = useTranslations("common");
  const [saving, setSaving] = useState(false);

  async function save(patch: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        // Die Route liefert stabile Fehler-Codes, keine Prosa — deshalb der Code-Parser. `null`
        // (kein Code lesbar) löst useApiError() zur generischen Meldung auf.
        toast.error(apiError(await parseApiErrorCode(res)));
        return false;
      }
      // Nur nach einer angenommenen Änderung neu laden — ein abgelehnter Patch hat den Server-Stand
      // nicht angefasst, ein Refresh wäre ein RSC-Rerender (inkl. DB-Queries) ohne jede Wirkung.
      router.refresh();
      return true;
    } catch {
      toast.error(tc("networkError"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { saving, save };
}
