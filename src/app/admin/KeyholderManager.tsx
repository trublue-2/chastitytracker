"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import Select from "@/app/components/Select";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";

interface Person { id: string; username: string }
interface Candidate extends Person { role?: string }

/** Admin assigns/removes keyholders for a sub (AdminUserRelationship). Self-control is rejected. */
export default function KeyholderManager({ subId, initial }: { subId: string; initial: Person[] }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((u: Candidate[]) => setCandidates(u))
      .catch(() => {});
  }, []);

  const assignedIds = new Set(initial.map((k) => k.id));
  // Admins can't be keyholders (they already have full access) — excluded from candidates.
  const options = candidates
    .filter((c) => c.id !== subId && c.role !== "admin" && !assignedIds.has(c.id))
    .map((c) => ({ value: c.id, label: c.username }));

  async function mutate(method: "POST" | "DELETE", keyholderId: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${subId}/keyholders`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyholderId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || tc("error"));
      }
      setSelected("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message || tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-foreground-faint">{t("keyholdersDesc")}</p>
      {initial.length === 0 ? (
        <p className="text-sm text-foreground-muted">{t("keyholdersNone")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {initial.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-2 bg-surface-raised rounded-lg px-3 py-2">
              <span className="text-sm text-foreground">{k.username}</span>
              <button
                onClick={() => mutate("DELETE", k.id)}
                disabled={saving}
                title={tc("delete")}
                className="p-1 text-warn hover:bg-warn-bg rounded-full disabled:opacity-50 transition"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {options.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              options={[{ value: "", label: t("keyholderSelect") }, ...options]}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            />
          </div>
          <Button onClick={() => mutate("POST", selected)} loading={saving} disabled={!selected}>
            {t("keyholderAdd")}
          </Button>
        </div>
      )}
      <FormError message={error} variant="compact" />
    </div>
  );
}
