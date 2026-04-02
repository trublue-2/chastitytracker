"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";
import ActionModal from "@/app/components/ActionModal";
import FormField from "@/app/components/FormField";
import FormError from "@/app/components/FormError";

const inputCls = "text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted";

interface Props {
  userId: string;
  art: "ANFORDERUNG" | "SPERRZEIT";
}

export default function VerschlussAnforderungForm({ userId, art }: Props) {
  const router = useRouter();
  const isSperrzeit = art === "SPERRZEIT";
  const accentColor = isSperrzeit ? "var(--color-sperrzeit)" : "var(--color-request)";
  const accentBg = isSperrzeit ? "var(--color-sperrzeit-bg)" : "var(--color-request-bg)";
  const title = isSperrzeit ? "Sperrdauer setzen" : "Verschluss anfordern";

  const [nachricht, setNachricht] = useState("");
  const [mode, setMode] = useState<"duration" | "datetime">("duration");
  const [deadlineH, setDeadlineH] = useState(isSperrzeit ? "24" : "4");
  const [endetAt, setEndetAt] = useState("");
  const [withMinDauer, setWithMinDauer] = useState(false);
  const [minDauerH, setMinDauerH] = useState("24");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "datetime" && endetAt && new Date(endetAt) <= new Date()) {
      setError("Zeitpunkt muss in der Zukunft liegen");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        userId, art,
        nachricht: nachricht.trim() || undefined,
      };
      if (mode === "datetime" && endetAt) {
        payload.endetAt = new Date(endetAt).toISOString();
      } else {
        payload.fristH = parseFloat(deadlineH) || (isSperrzeit ? 24 : 4);
      }
      if (!isSperrzeit && withMinDauer) {
        payload.dauerH = parseFloat(minDauerH) || 24;
      }

      const res = await fetch("/api/admin/verschluss-anforderung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      title={title}
      icon={<Lock size={20} strokeWidth={2} style={{ color: accentColor }} />}
      iconBg={accentBg}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Anweisung (optional)">
          <textarea
            value={nachricht}
            onChange={(e) => setNachricht(e.target.value)}
            placeholder="Anweisung (optional)"
            rows={2}
            className={`${inputCls} w-full resize-none`}
          />
        </FormField>

        {/* Frist Toggle */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-foreground-faint">Frist</label>
          <div className="flex bg-surface-raised border border-border rounded-xl overflow-hidden">
            <button type="button" onClick={() => setMode("duration")}
              className={`flex-1 py-2 text-sm text-center transition-all ${
                mode === "duration" ? "bg-foreground text-background font-semibold" : "text-foreground-muted hover:bg-border-subtle"
              }`}>
              Dauer (h)
            </button>
            <button type="button" onClick={() => setMode("datetime")}
              className={`flex-1 py-2 text-sm text-center transition-all ${
                mode === "datetime" ? "bg-foreground text-background font-semibold" : "text-foreground-muted hover:bg-border-subtle"
              }`}>
              Bis Datum/Zeit
            </button>
          </div>
        </div>

        {mode === "duration" ? (
          <div className="flex items-center gap-2">
            <input type="number" value={deadlineH} onChange={(e) => setDeadlineH(e.target.value)}
              min={0.5} step={0.5} className={`w-24 ${inputCls}`} />
            <span className="text-xs text-foreground-faint">h</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <input type="datetime-local" value={endetAt} onChange={(e) => setEndetAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)} className={`w-full ${inputCls}`} />
            <span className="text-xs text-foreground-faint">
              {isSperrzeit ? "Sperrdauer endet am gewählten Zeitpunkt" : "Frist zum Einschliessen"}
            </span>
          </div>
        )}

        {/* Mindest-Tragedauer (nur bei ANFORDERUNG) */}
        {!isSperrzeit && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={withMinDauer} onChange={(e) => setWithMinDauer(e.target.checked)}
                className="accent-[var(--color-request)] w-4 h-4" />
              <span className="text-xs text-foreground-faint">Mindest-Tragedauer festlegen</span>
            </label>
            {withMinDauer && (
              <div className="flex flex-col gap-1.5 pl-6">
                <div className="flex items-center gap-2">
                  <input type="number" value={minDauerH} onChange={(e) => setMinDauerH(e.target.value)}
                    min={1} step={1} className={`w-24 ${inputCls}`} />
                  <span className="text-xs text-foreground-faint">h</span>
                </div>
                <span className="text-xs text-foreground-faint">Nach dem Einschliessen wird automatisch eine Sperrdauer erstellt.</span>
              </div>
            )}
          </div>
        )}

        <FormError message={error} variant="compact" />

        <button type="submit" disabled={saving}
          className="flex items-center justify-center gap-2 text-sm font-medium text-white rounded-xl px-4 py-3 disabled:opacity-50 transition hover:opacity-80"
          style={{ backgroundColor: accentColor }}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
          {saving ? "Sende…" : "Senden"}
        </button>
      </form>
    </ActionModal>
  );
}
