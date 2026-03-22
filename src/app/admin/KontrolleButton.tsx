"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { useTranslations } from "next-intl";

export default function KontrolleButton({ userId, hasEmail }: { userId: string; hasEmail: boolean }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kommentar, setKommentar] = useState("");
  const [deadlineH, setDeadlineH] = useState("4");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  if (!hasEmail) return null;

  async function handleSubmit() {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/kontrolle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          kommentar: kommentar.trim() || undefined,
          deadlineH: parseFloat(deadlineH) || 4,
        }),
      });
      const data = await res.json();
      setLoading(false);
      if (res.ok) {
        setMsg(t("requestedSuccess"));
        setOpen(false);
        setKommentar("");
        setDeadlineH("4");
        router.refresh();
      } else {
        setMsg(data.error || t("kontrolleTitle"));
      }
    } catch (err) {
      setLoading(false);
      console.error("[KontrolleButton]", err);
      setMsg(t("kontrolleTitle"));
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={() => { setOpen(true); setMsg(""); }}
          className="flex items-center gap-1.5 text-xs font-medium text-orange-600 border border-orange-200 bg-orange-50 rounded-lg px-2.5 py-1 hover:bg-orange-100 transition"
        >
          <Bell size={11} />
          {t("requestInspection")}
        </button>
        {msg && <p className="text-xs text-gray-500">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-orange-700">{t("kontrolleTitle")}</span>
        <button type="button" onClick={() => { setOpen(false); setMsg(""); setKommentar(""); setDeadlineH("4"); }}
          className="text-orange-400 hover:text-orange-600 transition">
          <X size={14} />
        </button>
      </div>
      <textarea
        value={kommentar}
        onChange={(e) => setKommentar(e.target.value)}
        placeholder={t("kontrolleInstruction")}
        rows={2}
        className="w-full text-xs bg-white border border-orange-200 rounded-lg px-3 py-2 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-orange-700 font-medium whitespace-nowrap">{t("kontrolleHours")}</label>
        <input
          type="number"
          value={deadlineH}
          onChange={(e) => setDeadlineH(e.target.value)}
          min={0.5}
          step={0.5}
          className="w-20 text-xs bg-white border border-orange-200 rounded-lg px-3 py-1.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <span className="text-xs text-orange-600">h</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-white bg-orange-500 rounded-lg px-3 py-1.5 hover:bg-orange-400 disabled:opacity-50 transition"
        >
          <Bell size={11} />
          {loading ? t("sending") : t("kontrolleRequest")}
        </button>
        {msg && <p className="text-xs text-red-500">{msg}</p>}
      </div>
    </div>
  );
}
