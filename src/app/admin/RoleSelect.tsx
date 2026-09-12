"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { useUserSettingsSave } from "@/app/hooks/useUserSettingsSave";

type Role = "user" | "admin";

/** Welcher der beiden Texte zu welcher ZIEL-Rolle gehört. Eine Tabelle statt dreier paralleler
 *  Ternäre am Dialog: eine vierte Eigenschaft (Tönung, Zeichen) ergänzt hier ein Feld, statt ein
 *  viertes `? :` danebenzustellen, das mit den anderen dreien in Gleichschritt bleiben muss. */
const ROLE_CONFIRM = {
  user: { title: "roleSelfDemoteTitle", message: "roleSelfDemoteConfirm", action: "roleSelfDemoteAction" },
  admin: { title: "rolePromoteTitle", message: "rolePromoteConfirm", action: "rolePromoteAction" },
} as const;

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
  // Optimistisch, damit die Pille sofort umfärbt; ein abgelehnter Patch setzt zurück. Prisma liefert
  // `role` als blossen String — alles ausser „admin" ist hier die Benutzer-Rolle, damit ein
  // Fremdwert aus der Datenbank nicht als dritte Rolle durch die Tabelle unten fällt.
  const [role, setRole] = useState<Role>(currentRole === "admin" ? "admin" : "user");
  // Die offene Rückfrage IST die Ziel-Rolle — mehr braucht es nicht: welcher Text dazugehört,
  // schlägt `ROLE_CONFIRM` darüber nach. Ein zweites Feld „welcher Fall" daneben wäre nicht nur
  // überflüssig, es liesse sich auch widersprüchlich setzen.
  const [pending, setPending] = useState<Role | null>(null);

  async function apply(next: Role) {
    // Auf den zuletzt ANGEZEIGTEN Wert zurücksetzen, nicht auf `currentRole`: das Prop wird erst
    // durch das (nicht abgewartete) router.refresh() im Hook nachgezogen und kann kurz veraltet sein.
    const previous = role;
    setRole(next);
    if (!(await save({ role: next }))) setRole(previous);
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Role;
    if (next === role) return;
    // Die beiden Fälle schliessen sich aus: „user" bei sich selbst gegen „admin" bei irgendwem.
    if ((isSelf && next === "user") || next === "admin") return setPending(next);
    void apply(next);
  }

  const texts = ROLE_CONFIRM[pending ?? "admin"];

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

      {/* SOLANGE die Rückfrage offen steht, zeigt das `<select>` durch `value={role}` weiterhin die
          ALTE Rolle — die Auswahl im DOM nimmt React beim Rendern zurück. Der Dialog benennt die
          Zielrolle deshalb im Text, damit trotzdem klar ist, worüber gerade entschieden wird. */}
      <ConfirmDialog
        open={pending !== null}
        title={t(texts.title)}
        message={t(texts.message)}
        confirmLabel={t(texts.action)}
        onConfirm={() => {
          const next = pending;
          setPending(null);
          if (next) void apply(next);
        }}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
