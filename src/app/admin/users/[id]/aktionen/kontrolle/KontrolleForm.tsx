"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2 } from "lucide-react";
import ActionModal from "@/app/components/ActionModal";
import FormField from "@/app/components/FormField";
import FormError from "@/app/components/FormError";

const inputCls = "text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted";

export default function KontrolleForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [kommentar, setKommentar] = useState("");
  const [deadlineH, setDeadlineH] = useState("4");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/kontrolle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          kommentar: kommentar.trim() || undefined,
          deadlineH: parseFloat(deadlineH) || 4,
        }),
      });
      const data = await res.json().catch(() => ({}));
      setSaving(false);
      if (res.ok) {
        router.push(`/admin/users/${userId}/aktionen`);
      } else {
        setError(data.error || "Fehler");
      }
    } catch {
      setSaving(false);
      setError("Netzwerkfehler");
    }
  }

  return (
    <ActionModal
      open={true}
      onClose={() => router.push(`/admin/users/${userId}/aktionen`)}
      title="Kontrolle anfordern"
      icon={<Bell size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />}
      iconBg="var(--color-inspect-bg)"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Anweisung (optional)">
          <textarea
            value={kommentar}
            onChange={(e) => setKommentar(e.target.value)}
            placeholder="Anweisung (optional)"
            rows={2}
            className={`${inputCls} w-full resize-none`}
          />
        </FormField>

        <div className="flex items-center gap-2">
          <label className="text-xs text-foreground-faint whitespace-nowrap">Frist (Stunden)</label>
          <input type="number" value={deadlineH} onChange={(e) => setDeadlineH(e.target.value)}
            min={0.5} step={0.5} className={`w-24 ${inputCls}`} />
          <span className="text-xs text-foreground-faint">h</span>
        </div>

        <FormError message={error} variant="compact" />

        <button type="submit" disabled={saving}
          className="flex items-center justify-center gap-2 text-sm font-medium text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] rounded-xl px-4 py-3 disabled:opacity-50 transition">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
          {saving ? "Sende…" : "Anfordern"}
        </button>
      </form>
    </ActionModal>
  );
}
