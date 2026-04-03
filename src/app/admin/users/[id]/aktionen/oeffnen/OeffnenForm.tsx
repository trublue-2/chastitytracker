"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LockOpen } from "lucide-react";
import { toDatetimeLocal } from "@/lib/utils";
import { useTranslations } from "next-intl";
import Card from "@/app/components/Card";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";

export default function OeffnenForm({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const tOffen = useTranslations("openForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const [startTime, setStartTime] = useState(() => toDatetimeLocal(new Date()));
  const [oeffnenGrund, setOeffnenGrund] = useState("KEYHOLDER");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        type: "OEFFNEN",
        startTime: new Date(startTime).toISOString(),
        oeffnenGrund,
        note: note.trim() || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      router.push(`/admin/users/${userId}/aktionen`);
    } else {
      const d = await res.json();
      setError(d.error || tc("error"));
    }
  }

  const grundOptions = [
    { value: "REINIGUNG", label: tOffen("grundReinigung") },
    { value: "KEYHOLDER", label: tOffen("grundKeyholder") },
    { value: "NOTFALL", label: tOffen("grundNotfall") },
    { value: "ANDERES", label: tOffen("grundAnderes") },
  ];

  return (
    <main className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <Link href={`/admin/users/${userId}/aktionen`} className="text-sm text-foreground-faint hover:text-foreground transition">
        ← {t("aktionen")}
      </Link>

      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-unlock-bg)" }}>
            <LockOpen size={20} strokeWidth={2} style={{ color: "var(--color-unlock)" }} />
          </div>
          <h1 className="text-base font-semibold text-foreground">{tOffen("title")}</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
          <Input
            label={tc("dateTime")}
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
          <Select
            label={tOffen("grundLabel")}
            value={oeffnenGrund}
            onChange={(e) => setOeffnenGrund(e.target.value)}
            options={grundOptions}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              {tc("comment")}<span className="text-warn ml-0.5">*</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tc("comment")}
              rows={2}
              required
              className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm text-foreground bg-surface-raised placeholder:text-foreground-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-focus-ring"
            />
          </div>
          <FormError message={error || null} />
          <Button type="submit" variant="primary" fullWidth loading={saving} icon={<LockOpen size={16} />}>
            {tOffen("saveBtn")}
          </Button>
        </form>
      </Card>
    </main>
  );
}
