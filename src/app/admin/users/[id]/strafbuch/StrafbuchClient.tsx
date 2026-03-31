"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronDown } from "lucide-react";

const inputCls = "w-full bg-surface-raised border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted focus:border-transparent transition";

export interface StrafeRecordData {
  refId: string;
  bestraftDatumStr: string; // pre-formatted on server
  notiz: string | null;
}

export interface UnerlaubteOeffnungRow {
  id: string;
  startTimeStr: string;
  note: string | null;
  sperrzetEndetAtStr: string | null;
  sperrzetUnbefristet: boolean;
}

export interface KontrollRow {
  id: string;
  code: string;
  deadlineStr: string;
  fulfilledAtStr: string | null;
  entryStartTimeStr: string | null;
  backdated: boolean;
  kommentar: string | null;
  entryNote: string | null;
}

interface Props {
  userId: string;
  unerlaubteOeffnungen: UnerlaubteOeffnungRow[];
  zuSpaet: KontrollRow[];
  abgelehnt: KontrollRow[];
  strafeRecords: StrafeRecordData[];
  labels: {
    lockedUntil: string;
    lockedIndefinite: string;
    frist: string;
    systemLabel: string;
    givenLabel: string;
    timeCorrected: string;
    fulfilledLabel: string;
    instructionLabel: string;
    strafbuchUnerlaubteOeffnungen: string;
    strafbuchZuSpaet: string;
    strafbuchAbgelehnt: string;
    strafbuchEmpty: string;
    strafbuchNoEntries: string;
    strafbuchWurdeBestraft: string;
    strafbuchBestraftMarkieren: string;
    strafbuchBestraftDatum: string;
    strafbuchNotiz: string;
    strafbuchBestraftBadge: string;
    strafbuchAlleAnzeigen: string;
    strafbuchOffeneAnzeigen: string;
    strafbuchAbbrechen: string;
    strafbuchRueckgaengig: string;
  };
}

function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, safe for <input type="date">
}

export default function StrafbuchClient({ userId, unerlaubteOeffnungen, zuSpaet, abgelehnt, strafeRecords, labels }: Props) {
  const router = useRouter();

  const [showAll, setShowAll] = useState(false);
  const [openFormId, setOpenFormId] = useState<string | null>(null);

  const punishedIds = new Set(strafeRecords.map(r => r.refId));

  const hasOpen = [
    ...unerlaubteOeffnungen.filter(o => !punishedIds.has(o.id)),
    ...zuSpaet.filter(k => !punishedIds.has(k.id)),
    ...abgelehnt.filter(k => !punishedIds.has(k.id)),
  ].length > 0;

  const hasAny = unerlaubteOeffnungen.length > 0 || zuSpaet.length > 0 || abgelehnt.length > 0;
  const hasPunished = strafeRecords.length > 0;

  function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
    return (
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{title}</p>
          <span className="text-xs font-semibold text-foreground-faint tabular-nums">{count}</span>
        </div>
        {count === 0 ? (
          <p className="px-5 py-4 text-sm text-foreground-faint">{labels.strafbuchEmpty}</p>
        ) : (
          <div className="divide-y divide-border-subtle">{children}</div>
        )}
      </div>
    );
  }

  function BestrafenForm({ refId, offenseType }: { refId: string; offenseType: "KONTROLLANFORDERUNG" | "OEFFNEN_ENTRY" }) {
    const [datum, setDatum] = useState(todayLocal());
    const [notiz, setNotiz] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function submit(e: React.FormEvent) {
      e.preventDefault();
      setLoading(true);
      setError("");
      const res = await fetch("/api/admin/strafe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, offenseType, refId, bestraftDatum: datum, notiz }),
      });
      setLoading(false);
      if (res.ok) {
        setOpenFormId(null);
        router.refresh();
      } else {
        const d = await res.json();
        setError(d.error || "Fehler");
      }
    }

    return (
      <form onSubmit={submit} className="mt-2 bg-surface-raised rounded-xl border border-border p-3 flex flex-col gap-2">
        <div>
          <label className="block text-xs text-foreground-faint mb-1">{labels.strafbuchBestraftDatum}</label>
          <input type="date" value={datum} onChange={e => setDatum(e.target.value)} required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-foreground-faint mb-1">{labels.strafbuchNotiz}</label>
          <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
        </div>
        {error && <p className="text-xs text-warn">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => setOpenFormId(null)}
            className="text-xs text-foreground-faint hover:text-foreground-muted transition px-3 py-1.5 rounded-lg border border-border">
            {labels.strafbuchAbbrechen}
          </button>
          <button type="submit" disabled={loading}
            className="text-xs font-semibold bg-[var(--color-ok)] text-white px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1 transition hover:opacity-90">
            <CheckCircle size={12} />
            {loading ? "…" : labels.strafbuchBestraftMarkieren}
          </button>
        </div>
      </form>
    );
  }

  async function handleUndo(refId: string) {
    await fetch("/api/admin/strafe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refId }),
    });
    router.refresh();
  }

  function PunishedBadge({ refId }: { refId: string }) {
    const record = strafeRecords.find(r => r.refId === refId);
    if (!record) return null;
    return (
      <div className="mt-1.5 flex items-start gap-2 flex-wrap">
        <span className="text-xs font-semibold text-[var(--color-ok)] border border-[var(--color-ok)] px-2 py-0.5 rounded-lg flex items-center gap-1">
          <CheckCircle size={10} /> {labels.strafbuchBestraftBadge} {record.bestraftDatumStr}
        </span>
        {record.notiz && <span className="text-xs text-foreground-faint italic">„{record.notiz}"</span>}
        <button type="button" onClick={() => handleUndo(refId)}
          className="text-xs text-foreground-faint hover:text-warn transition ml-auto">
          {labels.strafbuchRueckgaengig}
        </button>
      </div>
    );
  }

  function WurdeBestraftButton({ refId, offenseType }: { refId: string; offenseType: "KONTROLLANFORDERUNG" | "OEFFNEN_ENTRY" }) {
    const isOpen = openFormId === refId;
    return (
      <div className="mt-1.5">
        <button type="button"
          onClick={() => setOpenFormId(isOpen ? null : refId)}
          className="text-xs text-foreground-faint hover:text-[var(--color-ok)] border border-border hover:border-[var(--color-ok)] transition px-2.5 py-1 rounded-lg flex items-center gap-1">
          <CheckCircle size={11} />
          {labels.strafbuchWurdeBestraft}
          <ChevronDown size={11} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && <BestrafenForm refId={refId} offenseType={offenseType} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Toggle */}
      {hasPunished && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setShowAll(v => !v)}
            className="text-xs text-foreground-faint hover:text-foreground-muted transition border border-border rounded-xl px-3 py-1.5">
            {showAll ? labels.strafbuchOffeneAnzeigen : labels.strafbuchAlleAnzeigen}
          </button>
        </div>
      )}

      {!hasOpen && !showAll && (
        <div className="bg-surface rounded-2xl border border-border py-20 text-center text-foreground-faint text-sm">
          {hasAny ? `${labels.strafbuchAlleAnzeigen} →` : labels.strafbuchNoEntries}
        </div>
      )}

      {/* Unerlaubte Öffnungen */}
      {(() => {
        const rows = showAll ? unerlaubteOeffnungen : unerlaubteOeffnungen.filter(o => !punishedIds.has(o.id));
        if (rows.length === 0 && !showAll) return null;
        return (
          <Section title={labels.strafbuchUnerlaubteOeffnungen} count={showAll ? unerlaubteOeffnungen.length : rows.length}>
            {rows.map((o) => {
              const punished = punishedIds.has(o.id);
              return (
                <div key={o.id} className={`px-5 py-3 flex flex-col gap-0.5 ${punished ? "opacity-50" : ""}`}>
                  <span className={`text-sm font-semibold text-foreground ${punished ? "line-through" : ""}`}>
                    {o.startTimeStr}
                  </span>
                  {o.sperrzetEndetAtStr && (
                    <span className="text-xs text-warn">{labels.lockedUntil}: {o.sperrzetEndetAtStr}</span>
                  )}
                  {o.sperrzetUnbefristet && !o.sperrzetEndetAtStr && (
                    <span className="text-xs text-warn">{labels.lockedUntil}: {labels.lockedIndefinite}</span>
                  )}
                  {o.note && <span className="text-xs text-foreground-faint italic">„{o.note}"</span>}
                  {punished ? <PunishedBadge refId={o.id} /> : <WurdeBestraftButton refId={o.id} offenseType="OEFFNEN_ENTRY" />}
                </div>
              );
            })}
          </Section>
        );
      })()}

      {/* Zu spät erfüllte Kontrollen */}
      {(() => {
        const rows = showAll ? zuSpaet : zuSpaet.filter(k => !punishedIds.has(k.id));
        if (rows.length === 0 && !showAll) return null;
        return (
          <Section title={labels.strafbuchZuSpaet} count={showAll ? zuSpaet.length : rows.length}>
            {rows.map((k) => {
              const punished = punishedIds.has(k.id);
              return (
                <div key={k.id} className={`px-5 py-3 flex flex-col gap-0.5 ${punished ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-mono font-bold text-[var(--color-inspect)] text-sm ${punished ? "line-through" : ""}`}>{k.code}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-foreground-faint flex-wrap">
                    <span>{labels.frist}: {k.deadlineStr}</span>
                    {k.fulfilledAtStr && <span className="text-warn">{labels.systemLabel}: {k.fulfilledAtStr}</span>}
                  </div>
                  {k.backdated && k.entryStartTimeStr && (
                    <span className="text-xs text-warn font-medium">
                      {labels.timeCorrected} – {labels.givenLabel}: {k.entryStartTimeStr}
                    </span>
                  )}
                  {k.kommentar && <span className="text-xs text-foreground-faint italic">{labels.instructionLabel}: {k.kommentar}</span>}
                  {punished ? <PunishedBadge refId={k.id} /> : <WurdeBestraftButton refId={k.id} offenseType="KONTROLLANFORDERUNG" />}
                </div>
              );
            })}
          </Section>
        );
      })()}

      {/* Abgelehnte Kontrollen */}
      {(() => {
        const rows = showAll ? abgelehnt : abgelehnt.filter(k => !punishedIds.has(k.id));
        if (rows.length === 0 && !showAll) return null;
        return (
          <Section title={labels.strafbuchAbgelehnt} count={showAll ? abgelehnt.length : rows.length}>
            {rows.map((k) => {
              const punished = punishedIds.has(k.id);
              return (
                <div key={k.id} className={`px-5 py-3 flex flex-col gap-0.5 ${punished ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-mono font-bold text-[var(--color-inspect)] text-sm ${punished ? "line-through" : ""}`}>{k.code}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-foreground-faint flex-wrap">
                    {k.entryStartTimeStr && <span>{labels.fulfilledLabel}: {k.entryStartTimeStr}</span>}
                    <span>{labels.frist}: {k.deadlineStr}</span>
                  </div>
                  {k.kommentar && <span className="text-xs text-foreground-faint italic">{labels.instructionLabel}: {k.kommentar}</span>}
                  {k.entryNote && <span className="text-xs text-foreground-faint italic">„{k.entryNote}"</span>}
                  {punished ? <PunishedBadge refId={k.id} /> : <WurdeBestraftButton refId={k.id} offenseType="KONTROLLANFORDERUNG" />}
                </div>
              );
            })}
          </Section>
        );
      })()}
    </div>
  );
}
