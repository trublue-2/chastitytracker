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
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition"
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
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-400 w-44"
      />
      <button type="submit" disabled={loading}
        className="text-xs font-semibold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 transition disabled:opacity-50">
        {loading ? "…" : t("save")}
      </button>
      <button type="button" onClick={() => setOpen(false)}
        className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1.5 rounded-lg hover:bg-gray-100 transition">
        <X size={14} />
      </button>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 w-full">{error}</p>}
    </form>
  );
}
