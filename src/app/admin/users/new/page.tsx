"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import Card from "@/app/components/Card";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";

export default function NewUserPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const payload = {
      username: fd.get("username") as string,
      password: fd.get("password") as string,
      email: fd.get("email") as string,
      role: fd.get("role") as string,
    };

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? t("createError"));
      return;
    }

    router.push("/admin");
  }

  const roleOptions = [
    { value: "user", label: t("roleUser") },
    { value: "admin", label: t("roleAdmin") },
  ];

  return (
    <main className="w-full max-w-2xl mx-auto px-4 py-6">
      <Link href="/admin" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{t("backToUsers")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{t("newUser")}</h1>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            label={t("usernameLabel")}
            name="username"
            type="text"
            required
            autoComplete="off"
          />
          <Input
            label={t("passwordLabel")}
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            icon={
              <button type="button" onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? tc("hidePassword") : tc("showPassword")}
                className="text-foreground-faint hover:text-foreground-muted transition">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />
          <Input
            label={t("emailLabel")}
            name="email"
            type="email"
            required
            autoComplete="off"
          />
          <Select
            label={t("roleLabel")}
            name="role"
            defaultValue="user"
            options={roleOptions}
          />
          <FormError message={error} />
          <Button type="submit" variant="primary" fullWidth loading={saving}>
            {t("createUserBtn")}
          </Button>
        </form>
      </Card>
    </main>
  );
}
