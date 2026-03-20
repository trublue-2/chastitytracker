"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ChangePasswordButton({ userId }: { userId: string }) {
  const ts = useTranslations("settings");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      setSuccess(true);
      setPassword("");
      setTimeout(() => { setSuccess(false); setOpen(false); }, 1500);
    } else {
      const data = await res.json();
      setError(data.error ?? tc("error"));
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-gray-400 hover:text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition"
      >
        {ts("changePassword")}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-wrap">
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={ts("newPassword")}
        required
        minLength={4}
        autoFocus
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-indigo-400 w-36"
      />
      <button
        type="submit"
        disabled={loading}
        className="text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
      >
        {success ? tc("saved") : loading ? "…" : tc("save")}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setError(null); setPassword(""); }}
        className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1.5 rounded-lg hover:bg-gray-100 transition"
      >
        <X size={14} />
      </button>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 w-full">{error}</p>}
    </form>
  );
}
