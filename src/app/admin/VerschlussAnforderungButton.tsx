"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, X } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
  userId: string;
  hasEmail: boolean;
  isLocked: boolean;
  hasOffeneAnforderung: boolean;
  hasActiveSperrzeit: boolean;
}

export default function VerschlussAnforderungButton({
  userId, hasEmail, isLocked, hasOffeneAnforderung, hasActiveSperrzeit,
}: Props) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nachricht, setNachricht] = useState("");
  const [dauerTyp, setDauerTyp] = useState<"datum" | "dauer" | "unbefristet">("datum");
  const [endetAt, setEndetAt] = useState("");
  const [dauerH, setDauerH] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const art = isLocked ? "SPERRZEIT" : "ANFORDERUNG";

  if (art === "ANFORDERUNG" && (isLocked || !hasEmail || hasOffeneAnforderung)) return null;
  if (art === "SPERRZEIT" && (!isLocked || hasActiveSperrzeit)) return null;

  function reset() {
    setOpen(false); setMsg(""); setNachricht("");
    setDauerTyp("datum"); setEndetAt(""); setDauerH("");
  }

  async function handleSubmit() {
    setLoading(true); setMsg("");
    try {
      const payload: Record<string, unknown> = { userId, art, nachricht: nachricht.trim() || undefined };
      if (dauerTyp === "datum" && endetAt) payload.endetAt = new Date(endetAt).toISOString();
      if (dauerTyp === "dauer" && dauerH) payload.dauerH = parseFloat(dauerH);

      const res = await fetch("/api/admin/verschluss-anforderung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setLoading(false);
      if (res.ok) { reset(); router.refresh(); }
      else setMsg(data.error || t("kontrolleTitle"));
    } catch {
      setLoading(false);
      setMsg(t("kontrolleTitle"));
    }
  }

  const isAnforderung = art === "ANFORDERUNG";
  const label = isAnforderung ? t("requestLock") : t("setLockDuration");

  // Tailwind-Klassen vollständig (kein dynamisches Zusammenbauen)
  const btnBase = isAnforderung
    ? "text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100"
    : "text-rose-600 border-rose-200 bg-rose-50 hover:bg-rose-100";
  const panelBase = isAnforderung
    ? "bg-indigo-50 border-indigo-200"
    : "bg-rose-50 border-rose-200";
  const titleCls = isAnforderung ? "text-indigo-700" : "text-rose-700";
  const closeCls = isAnforderung ? "text-indigo-400 hover:text-indigo-600" : "text-rose-400 hover:text-rose-600";
  const textareaCls = isAnforderung
    ? "border-indigo-200 focus:ring-indigo-400"
    : "border-rose-200 focus:ring-rose-400";
  const activeTab = isAnforderung ? "bg-indigo-600 text-white border-indigo-600" : "bg-rose-600 text-white border-rose-600";
  const inputCls = isAnforderung ? "border-indigo-200 focus:ring-indigo-400" : "border-rose-200 focus:ring-rose-400";
  const sendCls = isAnforderung ? "bg-indigo-500 hover:bg-indigo-400" : "bg-rose-500 hover:bg-rose-400";

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setMsg(""); }}
        className={`flex items-center gap-1.5 text-xs font-medium border rounded-lg px-2.5 py-1 transition ${btnBase}`}
      >
        <Lock size={11} />
        {label}
      </button>
    );
  }

  return (
    <div className={`flex flex-col gap-2 p-3 border rounded-xl ${panelBase}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${titleCls}`}>{label}</span>
        <button type="button" onClick={reset} className={`transition ${closeCls}`}>
          <X size={14} />
        </button>
      </div>

      <textarea
        value={nachricht}
        onChange={(e) => setNachricht(e.target.value)}
        placeholder={t("messageLabel")}
        rows={2}
        className={`w-full text-xs bg-white border rounded-lg px-3 py-2 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 resize-none ${textareaCls}`}
      />

      <div className="flex gap-2 flex-wrap">
        {(isAnforderung ? ["datum", "dauer"] as const : ["datum", "dauer", "unbefristet"] as const).map((typ) => (
          <button
            key={typ}
            type="button"
            onClick={() => setDauerTyp(typ)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition ${dauerTyp === typ ? activeTab : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
          >
            {typ === "datum" ? t("untilDate") : typ === "dauer" ? t("durationHours") : t("indefinite")}
          </button>
        ))}
      </div>

      {dauerTyp === "datum" && (
        <input
          type="datetime-local"
          value={endetAt}
          onChange={(e) => setEndetAt(e.target.value)}
          className={`text-xs bg-white border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 ${inputCls}`}
        />
      )}
      {dauerTyp === "dauer" && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={dauerH}
            onChange={(e) => setDauerH(e.target.value)}
            min={0.5} step={0.5}
            placeholder="z. B. 24"
            className={`w-28 text-xs bg-white border rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:ring-2 ${inputCls}`}
          />
          <span className="text-xs text-gray-500">{t("kontrolleHours")}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className={`flex items-center gap-1.5 text-xs font-medium text-white rounded-lg px-3 py-1.5 disabled:opacity-50 transition ${sendCls}`}
        >
          <Lock size={11} />
          {loading ? t("sending") : t("submit")}
        </button>
        {msg && <p className="text-xs text-red-500">{msg}</p>}
      </div>
    </div>
  );
}
