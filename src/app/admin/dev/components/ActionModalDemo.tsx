"use client";

import { useState } from "react";
import { Bell, Lock } from "lucide-react";
import ActionModal from "@/app/components/ActionModal";
import FormField from "@/app/components/FormField";
import FormError from "@/app/components/FormError";

export default function ActionModalDemo() {
  const [openA, setOpenA] = useState(false);
  const [openB, setOpenB] = useState(false);

  return (
    <div className="flex gap-3 flex-wrap">
      <button onClick={() => setOpenA(true)}
        className="text-xs font-medium text-[var(--color-inspect)] border border-[var(--color-inspect-border)] bg-[var(--color-inspect-bg)] rounded-lg px-3 py-2 hover:opacity-80 transition">
        Kontrolle Modal öffnen
      </button>
      <button onClick={() => setOpenB(true)}
        className="text-xs font-medium text-[var(--color-request)] border border-[var(--color-request-border)] bg-[var(--color-request-bg)] rounded-lg px-3 py-2 hover:opacity-80 transition">
        Verschluss Modal öffnen
      </button>

      <ActionModal
        open={openA}
        onClose={() => setOpenA(false)}
        title="Kontrolle anfordern"
        icon={<Bell size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />}
        iconBg="var(--color-inspect-bg)"
      >
        <FormField label="Anweisung (optional)">
          <textarea placeholder="Anweisung..." rows={2}
            className="w-full text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground resize-none" />
        </FormField>
        <div className="flex items-center gap-2">
          <label className="text-xs text-foreground-faint">Stunden</label>
          <input type="number" defaultValue={4} className="w-24 text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground" />
          <span className="text-xs text-foreground-faint">h</span>
        </div>
        <FormError message="Beispiel-Fehlermeldung" variant="compact" />
        <button className="flex items-center justify-center gap-2 text-sm font-medium text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] rounded-xl px-4 py-3 transition">
          <Bell size={16} /> Anfordern
        </button>
      </ActionModal>

      <ActionModal
        open={openB}
        onClose={() => setOpenB(false)}
        title="Verschluss anfordern"
        icon={<Lock size={20} strokeWidth={2} style={{ color: "var(--color-request)" }} />}
        iconBg="var(--color-request-bg)"
      >
        <FormField label="Nachricht (optional)">
          <textarea placeholder="Nachricht..." rows={2}
            className="w-full text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground resize-none" />
        </FormField>
        <FormError message={null} />
        <button className="flex items-center justify-center gap-2 text-sm font-medium text-white bg-[var(--color-request)] rounded-xl px-4 py-3 transition hover:opacity-80">
          <Lock size={16} /> Senden
        </button>
      </ActionModal>
    </div>
  );
}
