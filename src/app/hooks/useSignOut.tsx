"use client";

import { useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { clearSwUserCache } from "@/lib/messages/swMessages";

/**
 * Das EINE Abmelden: Rückfrage, dann Cache des Service Workers leeren, dann `signOut`.
 *
 * Die Cache-Leerung gehört in JEDEN Weg hinaus (`cc92e56e`: der SW hielt `/api/entries` ohne
 * Nutzerbezug, ein Folge-Nutzer sah kurz fremde Einträge). Sie stand nur im Avatar-Menü, weil dort
 * die einzige Abmelde-Stelle war, als der Fehler behoben wurde — die später dazugekommenen
 * Seitenleisten und die Einstellungen haben sie nie bekommen.
 *
 * Gibt die Auslöse-Funktion und den Dialog zurück; der Aufrufer hängt `signOutDialog` irgendwo in
 * seinen Baum (der Dialog ist ein Portal, die Stelle ist egal).
 */
export function useSignOut(): { requestSignOut: () => void; signOutDialog: ReactNode } {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const signOutDialog = (
    <ConfirmDialog
      open={open}
      title={t("signOut")}
      message={t("signOutConfirm")}
      confirmLabel={t("signOut")}
      icon={<LogOut size={20} style={{ color: "var(--color-warn)" }} />}
      loading={loading}
      onCancel={() => setOpen(false)}
      onConfirm={() => {
        setLoading(true);
        clearSwUserCache();
        // Scheitert die Abmeldung (Netz), darf der Dialog nicht im Ladezustand stehen bleiben.
        signOut({ callbackUrl: "/login" }).catch(() => setLoading(false));
      }}
    />
  );

  return { requestSignOut: () => setOpen(true), signOutDialog };
}
