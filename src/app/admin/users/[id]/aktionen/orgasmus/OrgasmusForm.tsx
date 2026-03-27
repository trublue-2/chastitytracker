"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Droplets, Loader2 } from "lucide-react";
import { toDatetimeLocal } from "@/lib/utils";

const inputCls = "text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted";

export default function OrgasmusForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [startTime, setStartTime] = useState(() => toDatetimeLocal(new Date()));
  const [orgasmusArt, setOrgasmusArt] = useState("Orgasmus");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        type: "ORGASMUS",
        startTime: new Date(startTime).toISOString(),
        orgasmusArt,
        note: note.trim() || undefined,
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
    <main className="w-full max-w-3xl px-4 sm:px-6 py-6 flex flex-col gap-4">
      <Link href={`/admin/users/${userId}/aktionen`} className="text-sm text-foreground-faint hover:text-foreground transition">
        ← Aktionen
      </Link>

      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-orgasm-bg)" }}>
            <Droplets size={20} strokeWidth={2} style={{ color: "var(--color-orgasm)" }} />
          </div>
          <h1 className="text-base font-semibold text-foreground">Orgasmus erfassen</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-foreground-faint">Zeitpunkt</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputCls}
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-foreground-faint">Art</label>
            <select
              value={orgasmusArt}
              onChange={(e) => setOrgasmusArt(e.target.value)}
              className={inputCls}
            >
              <option value="Orgasmus">Orgasmus</option>
              <option value="ruinierter Orgasmus">Ruinierter Orgasmus</option>
              <option value="feuchter Traum">Feuchter Traum</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-foreground-faint">Notiz (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Notiz (optional)"
              rows={2}
              className={`${inputCls} w-full resize-none`}
            />
          </div>

          {error && <p className="text-xs text-warn">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 text-sm font-medium text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] rounded-xl px-4 py-3 disabled:opacity-50 transition"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Droplets size={16} />}
            {loading ? "Sende…" : "Orgasmus erfassen"}
          </button>
        </form>
      </div>
    </main>
  );
}
