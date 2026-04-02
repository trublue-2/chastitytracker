"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X, Loader2 } from "lucide-react";

const inputCls = "text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted";

export default function KontrolleForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [kommentar, setKommentar] = useState("");
  const [deadlineH, setDeadlineH] = useState("4");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/kontrolle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        kommentar: kommentar.trim() || undefined,
        deadlineH: parseFloat(deadlineH) || 4,
      }),
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
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-inspect-bg)" }}>
              <Bell size={20} strokeWidth={2} style={{ color: "var(--color-inspect)" }} />
            </div>
            <h1 className="text-base font-semibold text-foreground">Kontrolle anfordern</h1>
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
              value={kommentar}
              onChange={(e) => setKommentar(e.target.value)}
              placeholder="Anweisung (optional)"
              rows={2}
              className={`${inputCls} w-full resize-none`}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-foreground-faint whitespace-nowrap">Frist (Stunden)</label>
            <input
              type="number"
              value={deadlineH}
              onChange={(e) => setDeadlineH(e.target.value)}
              min={0.5}
              step={0.5}
              className={`w-24 ${inputCls}`}
            />
            <span className="text-xs text-foreground-faint">h</span>
          </div>

          {error && <p className="text-xs text-warn">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 text-sm font-medium text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] rounded-xl px-4 py-3 disabled:opacity-50 transition"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
            {loading ? "Sende…" : "Anfordern"}
          </button>
        </form>
      </div>
    </main>
  );
}
