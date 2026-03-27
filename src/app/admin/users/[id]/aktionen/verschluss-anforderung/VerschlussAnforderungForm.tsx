"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Loader2 } from "lucide-react";

const inputCls = "text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted";

interface Props {
  userId: string;
  art: "ANFORDERUNG" | "SPERRZEIT";
}

export default function VerschlussAnforderungForm({ userId, art }: Props) {
  const router = useRouter();
  const isSperrzeit = art === "SPERRZEIT";
  const dauerTypOptions: ("datum" | "dauer" | "unbefristet")[] = isSperrzeit
    ? ["datum", "dauer", "unbefristet"]
    : ["datum", "dauer"];

  const [nachricht, setNachricht] = useState("");
  const [dauerTyp, setDauerTyp] = useState<"datum" | "dauer" | "unbefristet">("datum");
  const [endetAt, setEndetAt] = useState("");
  const [dauerH, setDauerH] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const accentColor = isSperrzeit ? "var(--color-sperrzeit)" : "var(--color-request)";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const payload: Record<string, unknown> = {
      userId,
      art,
      nachricht: nachricht.trim() || undefined,
    };
    if (dauerTyp === "datum" && endetAt) payload.endetAt = new Date(endetAt).toISOString();
    if (dauerTyp === "dauer" && dauerH) payload.dauerH = parseFloat(dauerH);

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
    <main className="w-full max-w-3xl px-4 sm:px-6 py-6 flex flex-col gap-4">
      <Link href={`/admin/users/${userId}/aktionen`} className="text-sm text-foreground-faint hover:text-foreground transition">
        ← Aktionen
      </Link>

      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: isSperrzeit ? "var(--color-sperrzeit-bg, var(--color-request-bg))" : "var(--color-request-bg)" }}
          >
            <Lock size={20} strokeWidth={2} style={{ color: accentColor }} />
          </div>
          <h1 className="text-base font-semibold text-foreground">
            {isSperrzeit ? "Sperrdauer setzen" : "Verschluss anfordern"}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-foreground-faint">Nachricht (optional)</label>
            <textarea
              value={nachricht}
              onChange={(e) => setNachricht(e.target.value)}
              placeholder="Nachricht (optional)"
              rows={2}
              className={`${inputCls} w-full resize-none`}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            {dauerTypOptions.map((typ) => (
              <button
                key={typ}
                type="button"
                onClick={() => setDauerTyp(typ)}
                className={`text-sm px-3 py-1.5 rounded-xl border transition ${
                  dauerTyp === typ
                    ? "text-foreground-invert border-transparent"
                    : "bg-surface-raised text-foreground-muted border-border hover:border-border-strong"
                }`}
                style={dauerTyp === typ ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
              >
                {typ === "datum" ? "Bis Datum" : typ === "dauer" ? "Dauer (h)" : "Unbefristet"}
              </button>
            ))}
          </div>

          {dauerTyp === "datum" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground-faint">Enddatum</label>
              <input
                type="datetime-local"
                value={endetAt}
                onChange={(e) => setEndetAt(e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          {dauerTyp === "dauer" && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={dauerH}
                onChange={(e) => setDauerH(e.target.value)}
                min={0.5}
                step={0.5}
                placeholder="z. B. 24"
                className={`w-28 ${inputCls}`}
              />
              <span className="text-xs text-foreground-faint">Stunden</span>
            </div>
          )}

          {error && <p className="text-xs text-warn">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 text-sm font-medium text-[var(--btn-primary-text)] rounded-xl px-4 py-3 disabled:opacity-50 transition hover:opacity-80"
            style={{ backgroundColor: isSperrzeit ? "var(--color-sperrzeit)" : "var(--btn-primary-bg)" }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            {loading ? "Sende…" : "Senden"}
          </button>
        </form>
      </div>
    </main>
  );
}
