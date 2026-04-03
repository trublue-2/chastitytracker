"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";

export default function ChangeEmailButton({ userId, currentEmail }: { userId: string; currentEmail: string | null }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSaving(false);
    if (!res.ok) { setError(t("savingError")); return; }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" icon={<Mail size={13} />} onClick={() => setOpen(true)}>
        E-Mail
      </Button>
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
        className="border border-border rounded-lg px-3 py-1.5 text-base text-foreground bg-surface focus:outline-none focus-visible:outline-2 focus-visible:outline-focus-ring w-44"
      />
      <Button size="sm" variant="primary" type="submit" loading={saving}>
        {t("save")}
      </Button>
      <button type="button" onClick={() => setOpen(false)}
        className="text-xs text-foreground-faint hover:text-foreground-muted px-1.5 py-1.5 rounded-lg hover:bg-surface-raised transition">
        <X size={14} />
      </button>
      <FormError message={error || null} />
    </form>
  );
}
