"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import { useApiError } from "@/app/hooks/useApiError";
import { fetchWithTimeout, parseApiErrorCode } from "@/lib/apiClient";

/**
 * Geteilter Saver für die Admin-Settings-Toggles: PATCH auf `url`.
 * Wertet die Antwort aus: ein abgelehnter Patch (z.B. ungültige HH:MM-Uhrzeit) zeigt seinen
 * stabilen Fehler-Code als Toast, statt den Wert beim `router.refresh()` stumm zurückspringen
 * zu lassen. `saving` deaktiviert die Eingaben, solange der Request läuft.
 *
 * `save` liefert `true`, wenn der Server den Patch übernommen hat — Aufrufer können darauf ihre
 * lokale Eingabe zurücksetzen (siehe TimeInput).
 *
 * Die meisten Abschnitte schreiben Felder am User und nehmen dafür {@link useUserSettingsSave};
 * diese Fassung bedient die mit eigener Route (Vergehens-Regeln). `NotificationToggles` hat sein
 * eigenes `fetch` noch von früher — es gehört hierher, ist aber nicht Teil dieser Änderung.
 *
 * `refresh: false` für Abschnitte, deren Anzeige rein lokal ist: der Refresh rendert die ganze
 * Einstellungs-Seite samt ihrer Server-Queries neu, und wenn die Komponente den frischen Prop-Wert
 * ohnehin nicht übernimmt, ist das Arbeit ohne jede Wirkung.
 */
export function useSettingsSave(url: string, { refresh = true }: { refresh?: boolean } = {}) {
  const router = useRouter();
  const toast = useToast();
  const apiError = useApiError();
  const tc = useTranslations("common");
  const [saving, setSaving] = useState(false);

  async function save(patch: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetchWithTimeout(url, {
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
      if (refresh) router.refresh();
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

/** {@link useSettingsSave} auf der Sammel-Route der Sub-Einstellungen (PATCH /api/admin/users/[id]). */
export function useUserSettingsSave(userId: string) {
  return useSettingsSave(`/api/admin/users/${userId}`);
}
