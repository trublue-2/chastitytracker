"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, X } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ChangeEmailButton({ userId, currentEmail }: { userId: string; currentEmail: string | null }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) { setError(t("savingError")); return; }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-foreground-faint hover:text-foreground-muted border border-border rounded-lg px-2.5 py-1.5 hover:bg-surface-raised transition"
      >
        <Mail size={13} /> E-Mail
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-wrap">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="user@example.com"
        autoFocus
        className="border border-border rounded-lg px-3 py-1.5 text-base text-foreground bg-surface focus:outline-none focus:ring-2 focus:ring-foreground-muted w-44"
      />
      <button type="submit" disabled={loading}
        className="text-xs font-semibold text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] px-3 py-1.5 rounded-lg transition disabled:opacity-50">
        {loading ? "…" : t("save")}
      </button>
      <button type="button" onClick={() => setOpen(false)}
        className="text-xs text-foreground-faint hover:text-foreground-muted px-1.5 py-1.5 rounded-lg hover:bg-surface-raised transition">
        <X size={14} />
      </button>
      {error && <p className="text-sm text-warn bg-warn-bg border border-warn-border rounded-xl px-3 py-2 w-full">{error}</p>}
    </form>
  );
}
