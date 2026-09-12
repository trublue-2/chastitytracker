"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";

/** Die offene Rückfrage: welche Rolle gesetzt werden soll und welcher der beiden Texte dazu gehört.
 *  Ein Zustand statt zweier Flags — die beiden Fälle schliessen sich aus (Hoch- und Rückstufung),
 *  und zwei `useState` daneben könnten widersprüchlich werden. */
type Pending = { next: string; kind: "demote" | "promote" };

/**
 * Die Rolle eines Kontos umstellen — beide Richtungen mit Rückfrage, weil beide Folgen haben, die
 * an dieser Pille nicht zu sehen sind:
 *
 *  - **Rückstufung (nur bei sich selbst):** Der Adminbereich ist weg, sobald die Sitzung die neue
 *    Rolle übernimmt. Der letzte Admin kann das ohnehin nicht (die Route antwortet mit 409).
 *  - **Hochstufung:** `keyholderRowReadable` (`lib/notify.ts`) schreibt für einen Betreff mit
 *    Admin-Rolle keine Keyholder-Posteingangs-Zeile mehr. Betroffen sind die `notifyControllers`-
 *    Meldungen — Aufgaben-Ergebnis und Nachweis, Wiegung und Zielgewicht, Stellungnahme, erledigte
 *    Strafe, Kontroll-Eskalation. NICHT betroffen sind die Geräte-Ereignisse: `entryNotify.ts`
 *    schreibt ohnehin nie in den Posteingang, dort stand also nie etwas. Zusätzlich zählt
 *    `getControllersOfUser` jeden Admin als Empfänger — die Person bekommt ab dann Mail und Push
 *    über JEDEN Träger der Instanz. Beides passiert lautlos, deshalb die Rückfrage.
 *
 * `ConfirmDialog` statt des nativen `confirm()`: Der Nutzer hat den Schritt bewusst angestossen und
 * bestätigt ihn nur noch, während der Text vor der Nebenwirkung warnt — das ist die Abgrenzung, die
 * `ConfirmDialog` gegenüber `RiskConfirmSheet` in seiner Doku selbst zieht. Das native `confirm()`
 * stand hier für die Rückstufung schon vorher und ist mit abgelöst: es steht ausserhalb des
 * Design-Systems und sieht in der Capacitor-WebView fremd aus.
 */
export default function RoleSelect({
  id,
  currentRole,
  isSelf,
}: {
  id: string;
  currentRole: string;
  isSelf: boolean;
}) {
  const t = useTranslations("admin");
  const { saving, save } = useUserSettingsSave(id);
  // Optimistisch, damit die Pille sofort umfärbt; ein abgelehnter Patch setzt zurück.
  const [role, setRole] = useState(currentRole);
  const [pending, setPending] = useState<Pending | null>(null);

  async function apply(next: string) {
    // Auf den zuletzt ANGEZEIGTEN Wert zurücksetzen, nicht auf `currentRole`: das Prop wird erst
    // durch das (nicht abgewartete) router.refresh() im Hook nachgezogen und kann kurz veraltet sein.
    const previous = role;
    setRole(next);
    if (!(await save({ role: next }))) setRole(previous);
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (next === role) return;
    // Die beiden Fälle schliessen sich aus: „user" bei sich selbst gegen „admin" bei irgendwem.
    if (isSelf && next === "user") return setPending({ next, kind: "demote" });
    if (next === "admin") return setPending({ next, kind: "promote" });
    void apply(next);
  }

  const demoting = pending?.kind === "demote";

  return (
    <>
      <select
        value={role}
        onChange={handleChange}
        disabled={saving}
        // Kein `focus:outline-none` mehr: das Feld hatte damit nur noch einen `ring`, also einen
        // `box-shadow` — im Windows-Kontrastmodus fällt der ersatzlos weg und der Fokus wäre auf einem
        // randlosen Element (`border-0`) gar nicht mehr zu sehen. Den Ring liefert jetzt `globals.css`.
        className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer transition ${
          role === "admin"
            ? "bg-[var(--color-request-bg)] text-[var(--color-request-text)]"
            : "bg-surface-raised text-foreground-faint"
        } disabled:opacity-50`}
      >
        <option value="user">{t("roleUser")}</option>
        <option value="admin">{t("roleAdmin")}</option>
      </select>

      {/* Ohne offene Rückfrage steht das `<select>` durch `value={role}` weiterhin auf der alten
          Rolle — die Auswahl im DOM nimmt React beim Rendern zurück. Der Dialog benennt die
          Zielrolle im Text, damit trotzdem klar ist, worüber gerade entschieden wird. */}
      <ConfirmDialog
        open={pending !== null}
        title={demoting ? t("roleSelfDemoteTitle") : t("rolePromoteTitle")}
        message={demoting ? t("roleSelfDemoteConfirm") : t("rolePromoteConfirm")}
        confirmLabel={demoting ? t("roleSelfDemoteAction") : t("rolePromoteAction")}
        onConfirm={() => {
          const next = pending?.next;
          setPending(null);
          if (next) void apply(next);
        }}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
