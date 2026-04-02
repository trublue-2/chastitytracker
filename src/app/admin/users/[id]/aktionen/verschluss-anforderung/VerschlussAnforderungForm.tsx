"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, X, Loader2 } from "lucide-react";

const inputCls = "text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted";

interface Props {
  userId: string;
  art: "ANFORDERUNG" | "SPERRZEIT";
}

export default function VerschlussAnforderungForm({ userId, art }: Props) {
  const router = useRouter();
  const isSperrzeit = art === "SPERRZEIT";
  const accentColor = isSperrzeit ? "var(--color-sperrzeit)" : "var(--color-request)";

  const [nachricht, setNachricht] = useState("");
  const [mode, setMode] = useState<"duration" | "datetime">("duration");
  const [deadlineH, setDeadlineH] = useState("24");
  const [endetAt, setEndetAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "datetime" && endetAt && new Date(endetAt) <= new Date()) {
      setError("Zeitpunkt muss in der Zukunft liegen");
      return;
    }
    setLoading(true);
    setError("");
    const payload: Record<string, unknown> = {
      userId,
      art,
      nachricht: nachricht.trim() || undefined,
    };
    if (mode === "datetime" && endetAt) {
      payload.endetAt = new Date(endetAt).toISOString();
    } else {
      payload.dauerH = parseFloat(deadlineH) || 24;
    }

    const res = await fetch("/api/admin/verschluss-anforderung", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (res.ok) {
      router.push(`/admin/users/${userId}/aktionen`);
    } else {
      const d = await res.json();
      setError(d.error || "Fehler");
    }
  }

  return (
    <main className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-surface rounded-2xl border border-border overflow-hidden w-full max-w-md">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: isSperrzeit ? "var(--color-sperrzeit-bg)" : "var(--color-request-bg)" }}
            >
              <Lock size={20} strokeWidth={2} style={{ color: accentColor }} />
            </div>
            <h1 className="text-base font-semibold text-foreground">
              {isSperrzeit ? "Sperrdauer setzen" : "Verschluss anfordern"}
            </h1>
          </div>
          <button type="button" onClick={() => router.push(`/admin/users/${userId}/aktionen`)}
            className="text-foreground-faint hover:text-foreground transition p-1">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-foreground-faint">Anweisung (optional)</label>
            <textarea
              value={nachricht}
              onChange={(e) => setNachricht(e.target.value)}
              placeholder="Anweisung (optional)"
              rows={2}
              className={`${inputCls} w-full resize-none`}
            />
          </div>

          {/* Mode Toggle */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-foreground-faint">Frist</label>
            <div className="flex bg-surface-raised border border-border rounded-xl overflow-hidden">
              <button type="button" onClick={() => setMode("duration")}
                className={`flex-1 py-2 text-sm text-center transition-all ${
                  mode === "duration"
                    ? "bg-foreground text-background font-semibold"
                    : "text-foreground-muted hover:bg-border-subtle"
                }`}>
                Dauer (h)
              </button>
              <button type="button" onClick={() => setMode("datetime")}
                className={`flex-1 py-2 text-sm text-center transition-all ${
                  mode === "datetime"
                    ? "bg-foreground text-background font-semibold"
                    : "text-foreground-muted hover:bg-border-subtle"
                }`}>
                Bis Datum/Zeit
              </button>
            </div>
          </div>

          {mode === "duration" ? (
            <div className="flex items-center gap-2">
              <input type="number" value={deadlineH}
                onChange={(e) => setDeadlineH(e.target.value)}
                min={0.5} step={0.5}
                className={`w-24 ${inputCls}`} />
              <span className="text-xs text-foreground-faint">h</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <input type="datetime-local" value={endetAt}
                onChange={(e) => setEndetAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className={`w-full ${inputCls}`} />
              <span className="text-xs text-foreground-faint">
                {isSperrzeit ? "Sperrdauer endet am gewählten Zeitpunkt" : "Frist zum Einschliessen"}
              </span>
            </div>
          )}

          {error && <p className="text-xs text-warn">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 text-sm font-medium text-white rounded-xl px-4 py-3 disabled:opacity-50 transition hover:opacity-80"
            style={{ backgroundColor: accentColor }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            {loading ? "Sende…" : "Senden"}
          </button>
        </form>
      </div>
    </main>
  );
}
