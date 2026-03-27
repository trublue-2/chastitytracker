"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

export default function NewUserPage() {
  const t = useTranslations("admin");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const email = fd.get("email") as string;
    const payload = {
      username: fd.get("username") as string,
      password: fd.get("password") as string,
      role: fd.get("role") as string,
      ...(email ? { email } : {}),
    };

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? t("createError"));
      setLoading(false);
      return;
    }

    router.push("/admin");
  }

  return (
    <main className="w-full max-w-5xl px-6 py-8"><div className="max-w-lg">
      <Link href="/admin" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{t("backToUsers")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-8">{t("newUser")}</h1>

      <div className="bg-surface rounded-2xl border border-border p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground-faint uppercase tracking-wider" htmlFor="username">{t("usernameLabel")}</label>
            <input
              id="username" name="username" type="text" required autoComplete="off"
              className="w-full border border-border rounded-xl px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted bg-surface-raised"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground-faint uppercase tracking-wider" htmlFor="password">{t("passwordLabel")}</label>
            <div className="relative">
              <input
                id="password" name="password" type={showPassword ? "text" : "password"} required autoComplete="new-password"
                className="w-full border border-border rounded-xl px-4 py-3 pr-12 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted bg-surface-raised"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-faint hover:text-foreground-muted transition p-1">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground-faint uppercase tracking-wider" htmlFor="email">{t("emailLabel")} <span className="text-foreground-faint font-normal normal-case">{t("emailOptional")}</span></label>
            <input
              id="email" name="email" type="email" autoComplete="off"
              className="w-full border border-border rounded-xl px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted bg-surface-raised"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground-faint uppercase tracking-wider" htmlFor="role">{t("roleLabel")}</label>
            <select
              id="role" name="role" defaultValue="user"
              className="w-full border border-border rounded-xl px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted bg-surface-raised"
            >
              <option value="user">{t("roleUser")}</option>
              <option value="admin">{t("roleAdmin")}</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full bg-foreground text-background font-semibold py-3 rounded-xl hover:opacity-80 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? t("creatingUser") : t("createUserBtn")}
          </button>
        </form>
      </div>
    </div></main>
  );
}
