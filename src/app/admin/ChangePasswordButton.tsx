"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";

export default function ChangePasswordButton({ userId }: { userId: string }) {
  const ts = useTranslations("settings");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setSaving(false);
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
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {ts("changePassword")}
      </Button>
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
        className="border border-border rounded-lg px-3 py-1.5 text-base text-foreground bg-surface focus:outline-none focus-visible:outline-2 focus-visible:outline-focus-ring w-36"
      />
      <Button size="sm" variant="primary" type="submit" loading={saving}>
        {success ? tc("saved") : tc("save")}
      </Button>
      <button
        type="button"
        onClick={() => { setOpen(false); setError(null); setPassword(""); }}
        className="text-xs text-foreground-faint hover:text-foreground-muted px-1.5 py-1.5 rounded-lg hover:bg-surface-raised transition"
      >
        <X size={14} />
      </button>
      <FormError message={error} />
    </form>
  );
}
