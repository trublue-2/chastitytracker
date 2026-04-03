"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Droplets } from "lucide-react";
import { toDatetimeLocal } from "@/lib/utils";
import { useTranslations } from "next-intl";
import Card from "@/app/components/Card";
import Input from "@/app/components/Input";
import Select from "@/app/components/Select";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Textarea from "@/app/components/Textarea";

export default function OrgasmusForm({ userId }: { userId: string }) {
  const t = useTranslations("admin");
  const tOrgasm = useTranslations("orgasmForm");
  const tc = useTranslations("common");
  const router = useRouter();
  const [startTime, setStartTime] = useState(() => toDatetimeLocal(new Date()));
  const [orgasmusArt, setOrgasmusArt] = useState("Orgasmus");
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
        type: "ORGASMUS",
        startTime: new Date(startTime).toISOString(),
        orgasmusArt,
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

  const artOptions = [
    { value: "Orgasmus", label: tOrgasm("artOrgasmus") },
    { value: "ruinierter Orgasmus", label: tOrgasm("artRuiniert") },
    { value: "feuchter Traum", label: tOrgasm("artTraum") },
  ];

  return (
    <main className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <Link href={`/admin/users/${userId}/aktionen`} className="text-sm text-foreground-faint hover:text-foreground transition">
        ← {t("aktionen")}
      </Link>

      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--color-orgasm-bg)" }}>
            <Droplets size={20} strokeWidth={2} style={{ color: "var(--color-orgasm)" }} />
          </div>
          <h1 className="text-base font-semibold text-foreground">{tOrgasm("title")}</h1>
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
            label={t("entryOrgasmusArt")}
            value={orgasmusArt}
            onChange={(e) => setOrgasmusArt(e.target.value)}
            options={artOptions}
          />
          <Textarea
            label={tc("noteOptional")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tc("note")}
            rows={2}
          />
          <FormError message={error || null} />
          <Button type="submit" variant="primary" fullWidth loading={saving} icon={<Droplets size={16} />}>
            {tOrgasm("title")}
          </Button>
        </form>
      </Card>
    </main>
  );
}
