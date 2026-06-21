"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Plus, Download, X } from "lucide-react";

interface Reference {
  id: string;
  imageUrl: string;
}

/**
 * Pflege der kuratierten Referenzfotos eines Geräts („Trainingsmaterial" für die Erkennung).
 * Ausklappbar pro Gerät: Liste, Hochladen, Aus-Verschluss-Fotos-übernehmen, Entfernen.
 */
export default function DeviceReferencesManager({ deviceId }: { deviceId: string }) {
  const t = useTranslations("devices");
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState<Reference[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/devices/${deviceId}/references`);
    if (res.ok) setRefs((await res.json()).references ?? []);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && refs === null) load();
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      if (!up.ok) return;
      const { url } = await up.json();
      await fetch(`/api/devices/${deviceId}/references`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function importRecent() {
    setBusy(true);
    try {
      await fetch(`/api/devices/${deviceId}/references/import-recent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 5 }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(refId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}/references/${refId}`, { method: "DELETE" });
      if (res.ok) setRefs((r) => r?.filter((x) => x.id !== refId) ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border-subtle px-4 py-3">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {t("referencesTitle")}
        {refs && refs.length > 0 && <span className="text-foreground-faint">({refs.length})</span>}
      </button>

      {open && (
        <div className="mt-3">
          <p className="text-xs text-foreground-faint mb-3">{t("referencesHint")}</p>

          <div className="flex flex-wrap gap-2 mb-3">
            {refs?.map((r) => (
              <div key={r.id} className="relative w-16 h-16 rounded-lg overflow-hidden bg-surface-raised">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.imageUrl} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={busy}
                  aria-label={t("referencesDelete")}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-warn transition-colors disabled:opacity-50"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {refs && refs.length === 0 && (
              <p className="text-xs text-foreground-faint py-2">{t("referencesEmpty")}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-sperrzeit-text bg-sperrzeit-bg border border-[var(--color-sperrzeit-border)] rounded-lg px-3 py-1.5 cursor-pointer hover:opacity-90 transition">
              <Plus size={14} />
              {t("referencesAdd")}
              <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={onPick} />
            </label>
            <button
              type="button"
              onClick={importRecent}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-muted bg-surface-raised border border-border rounded-lg px-3 py-1.5 hover:text-foreground transition disabled:opacity-50"
            >
              <Download size={14} />
              {t("referencesImport")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
