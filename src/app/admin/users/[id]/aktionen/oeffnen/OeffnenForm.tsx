"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockOpen } from "lucide-react";
import { toDatetimeLocal } from "@/lib/utils";
import { useTranslations } from "next-intl";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import DateTimePicker from "@/app/components/DateTimePicker";
import Select from "@/app/components/Select";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Textarea from "@/app/components/Textarea";

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
    <AdminActionFormShell
      userId={userId}
      backLabel={t("aktionen")}
      icon={<LockOpen size={20} strokeWidth={2} />}
      iconBg="var(--color-unlock-bg)"
      iconColor="var(--color-unlock)"
      title={tOffen("title")}
    >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
          <DateTimePicker
            label={tc("dateTime")}
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
          <Textarea
            label={tc("comment")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tc("comment")}
            rows={2}
            required
          />
          <FormError message={error || null} />
          <Button type="submit" variant="primary" fullWidth loading={saving} icon={<LockOpen size={16} />}>
            {tOffen("saveBtn")}
          </Button>
        </form>
    </AdminActionFormShell>
  );
}
