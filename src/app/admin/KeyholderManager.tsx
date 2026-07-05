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
  // Zuweisbar ist nur ein ANDERER Nicht-Admin-User, der nicht schon Keyholder ist:
  //  - der Sub selbst scheidet aus (niemand ist sein eigener Keyholder),
  //  - Admins scheiden aus, weil sie ohnehin ALLE Subs kontrollieren — ein Keyholder-Eintrag wäre
  //    redundant (die Route lehnt es zusätzlich serverseitig ab). Der „Keyholder dieses Subs"-
  //    Mechanismus ist genau für den Nicht-Admin-Fall: ein normaler User, der NUR diesen Sub
  //    kontrollieren soll (chirurgischer /admin-Zugang).
  // Folge: Gibt es ausser dem Sub nur Admins, ist die Liste leer und das Dropdown erscheint nicht —
  // dann greift der Hinweis unten (keyholdersNoCandidates).
  const options = candidates
    .filter((c) => c.id !== subId && c.role !== "admin" && !assignedIds.has(c.id))
    .map((c) => ({ value: c.id, label: c.username }));
  // Kandidaten sind geladen (>0), aber keiner ist zuweisbar → erklärender Hinweis statt leerem Nichts.
  const noAssignable = candidates.length > 0 && options.length === 0;

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
      {noAssignable && (
        <p className="text-xs text-foreground-faint">{t("keyholdersNoCandidates")}</p>
      )}
      <FormError message={error} variant="compact" />
    </div>
  );
}
