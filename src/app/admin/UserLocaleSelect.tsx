"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Select from "@/app/components/Select";
import FormError from "@/app/components/FormError";
import FormSuccess from "@/app/components/FormSuccess";
import { LOCALES_LONG } from "@/lib/constants";

/**
 * Lets a keyholder/admin set THIS sub's language from the sub-management page. Writes User.locale
 * (via PATCH /api/admin/users/[id]) — the same field the sub can set for themselves — so the sub's
 * e-mails/push and app language follow it. Mirrors RoleSelect's save pattern.
 */
export default function UserLocaleSelect({ userId, initialLocale }: { userId: string; initialLocale: string }) {
  const tc = useTranslations("common");
  const router = useRouter();
  const [value, setValue] = useState(initialLocale);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setValue(next);
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (!res.ok) throw new Error();
      setSuccess(true);
      router.refresh();
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Select value={value} onChange={handleChange} options={LOCALES_LONG} disabled={saving} />
      <FormSuccess message={success ? tc("saved") : null} variant="inline" />
      <FormError message={error} />
    </>
  );
}
