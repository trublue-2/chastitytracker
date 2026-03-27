"use client";

import { useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, X, Bell, Lock, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface UserStatus {
  username: string;
  email: string | null;
  isLocked: boolean;
  hasOffeneAnforderung: boolean;
  hasActiveSperrzeit: boolean;
}

interface UserListItem {
  id: string;
  username: string;
  isLocked: boolean;
}

type Sheet = "closed" | "picking" | "actions" | "kontrolle" | "verschluss";

export default function AdminFAB() {
  const t = useTranslations("admin");
  const router = useRouter();
  const pathname = usePathname();

  const [sheet, setSheet] = useState<Sheet>("closed");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [userList, setUserList] = useState<UserListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Kontrolle form state
  const [kommentar, setKommentar] = useState("");
  const [deadlineH, setDeadlineH] = useState("4");

  // Verschluss form state
  const [nachricht, setNachricht] = useState("");
  const [dauerTyp, setDauerTyp] = useState<"datum" | "dauer" | "unbefristet">("datum");
  const [endetAt, setEndetAt] = useState("");
  const [dauerH, setDauerH] = useState("");

  const userIdFromPath = pathname.match(/^\/admin\/users\/([^/]+)/)?.[1] ?? null;

  function resetForms() {
    setKommentar(""); setDeadlineH("4");
    setNachricht(""); setDauerTyp("datum"); setEndetAt(""); setDauerH("");
    setError("");
  }

  function close() {
    setSheet("closed");
    setSelectedUserId(null);
    setUserStatus(null);
    resetForms();
  }

  async function fetchUserStatus(userId: string): Promise<UserStatus | null> {
    const res = await fetch(`/api/admin/users/${userId}`);
    if (!res.ok) return null;
    return res.json();
  }

  async function fetchUserList(): Promise<UserListItem[]> {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return [];
    return res.json();
  }

  const handleOpen = useCallback(async () => {
    resetForms();
    setLoading(true);
    setError("");

    if (userIdFromPath) {
      const status = await fetchUserStatus(userIdFromPath);
      setLoading(false);
      if (!status) { setError("Fehler"); return; }
      setSelectedUserId(userIdFromPath);
      setUserStatus(status);
      setSheet("actions");
    } else {
      if (!userList) {
        const list = await fetchUserList();
        setUserList(list);
      }
      setLoading(false);
      setSheet("picking");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIdFromPath, userList]);

  async function handleSelectUser(userId: string) {
    setLoading(true);
    const status = await fetchUserStatus(userId);
    setLoading(false);
    if (!status) { setError("Fehler"); return; }
    setSelectedUserId(userId);
    setUserStatus(status);
    setSheet("actions");
  }

  async function submitKontrolle() {
    if (!selectedUserId) return;
    setLoading(true); setError("");
    const res = await fetch("/api/admin/kontrolle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, kommentar: kommentar.trim() || undefined, deadlineH: parseFloat(deadlineH) || 4 }),
    });
    setLoading(false);
    if (res.ok) { close(); router.refresh(); }
    else { const d = await res.json(); setError(d.error || "Fehler"); }
  }

  async function submitVerschluss() {
    if (!selectedUserId || !userStatus) return;
    setLoading(true); setError("");
    const art = userStatus.isLocked ? "SPERRZEIT" : "ANFORDERUNG";
    const payload: Record<string, unknown> = { userId: selectedUserId, art, nachricht: nachricht.trim() || undefined };
    if (dauerTyp === "datum" && endetAt) payload.endetAt = new Date(endetAt).toISOString();
    if (dauerTyp === "dauer" && dauerH) payload.dauerH = parseFloat(dauerH);

    const res = await fetch("/api/admin/verschluss-anforderung", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (res.ok) { close(); router.refresh(); }
    else { const d = await res.json(); setError(d.error || "Fehler"); }
  }

  const canKontrolle = userStatus?.email;
  const art = userStatus?.isLocked ? "SPERRZEIT" : "ANFORDERUNG";
  const canVerschluss = userStatus
    ? (art === "ANFORDERUNG" ? (!userStatus.isLocked && !!userStatus.email && !userStatus.hasOffeneAnforderung) : (userStatus.isLocked && !userStatus.hasActiveSperrzeit))
    : false;

  return (
    <>
      {/* Backdrop */}
      {sheet !== "closed" && (
        <div className="fixed inset-0 bg-black/40 z-40 sm:hidden" onClick={close} />
      )}

      {/* Bottom Sheet */}
      {sheet !== "closed" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-surface rounded-t-2xl border-t border-border shadow-xl pb-safe">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-foreground">
              {sheet === "picking" && t("selectUser")}
              {sheet === "actions" && (userStatus?.username ?? "")}
              {sheet === "kontrolle" && t("kontrolleTitle")}
              {sheet === "verschluss" && (art === "SPERRZEIT" ? t("setLockDuration") : t("requestLock"))}
            </h2>
            <button onClick={close} className="text-foreground-faint hover:text-foreground-muted transition p-1">
              <X size={18} />
            </button>
          </div>

          {/* User Picker */}
          {sheet === "picking" && (
            <div className="overflow-y-auto max-h-72 divide-y divide-border-subtle px-2 pb-4">
              {loading && (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-foreground-faint" />
                </div>
              )}
              {!loading && userList?.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleSelectUser(u.id)}
                  className="w-full flex items-center justify-between px-3 py-3 hover:bg-surface-raised transition rounded-xl text-left"
                >
                  <span className="text-sm font-medium text-foreground">{u.username}</span>
                  <div className="flex items-center gap-2">
                    {u.isLocked && <span className="text-xs text-lock font-medium">{t("locked")}</span>}
                    <ChevronRight size={16} className="text-foreground-faint" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Action Picker */}
          {sheet === "actions" && (
            <div className="flex flex-col gap-2 px-4 pb-6 pt-1">
              {loading && (
                <div className="flex justify-center py-6">
                  <Loader2 size={20} className="animate-spin text-foreground-faint" />
                </div>
              )}
              {!loading && (
                <>
                  <button
                    disabled={!canKontrolle}
                    onClick={() => { resetForms(); setSheet("kontrolle"); }}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-surface-raised text-left disabled:opacity-40 hover:bg-border-subtle transition"
                  >
                    <Bell size={18} className="text-[var(--color-inspect)] flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{t("requestInspection")}</p>
                      {!canKontrolle && <p className="text-xs text-foreground-faint">{t("noEmail")}</p>}
                    </div>
                  </button>
                  <button
                    disabled={!canVerschluss}
                    onClick={() => { resetForms(); setSheet("verschluss"); }}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-surface-raised text-left disabled:opacity-40 hover:bg-border-subtle transition"
                  >
                    <Lock size={18} className={`flex-shrink-0 ${art === "SPERRZEIT" ? "text-[var(--color-sperrzeit)]" : "text-[var(--color-request)]"}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {art === "SPERRZEIT" ? t("setLockDuration") : t("requestLock")}
                      </p>
                      {!canVerschluss && (
                        <p className="text-xs text-foreground-faint">
                          {userStatus?.isLocked && userStatus.hasActiveSperrzeit ? t("alreadyHasSperrzeit") :
                           !userStatus?.isLocked && userStatus?.hasOffeneAnforderung ? t("alreadyHasAnforderung") :
                           !userStatus?.email ? t("noEmail") : ""}
                        </p>
                      )}
                    </div>
                  </button>
                  {error && <p className="text-xs text-warn">{error}</p>}
                </>
              )}
            </div>
          )}

          {/* Kontrolle Form */}
          {sheet === "kontrolle" && (
            <div className="flex flex-col gap-3 px-4 pb-6 pt-1">
              <textarea
                value={kommentar}
                onChange={(e) => setKommentar(e.target.value)}
                placeholder={t("kontrolleInstruction")}
                rows={2}
                className="w-full text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted resize-none"
              />
              <div className="flex items-center gap-2">
                <label className="text-sm text-foreground-faint whitespace-nowrap">{t("kontrolleHours")}</label>
                <input
                  type="number"
                  value={deadlineH}
                  onChange={(e) => setDeadlineH(e.target.value)}
                  min={0.5} step={0.5}
                  className="w-24 text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted"
                />
                <span className="text-sm text-foreground-faint">h</span>
              </div>
              {error && <p className="text-xs text-warn">{error}</p>}
              <button
                onClick={submitKontrolle}
                disabled={loading}
                className="flex items-center justify-center gap-2 text-sm font-medium text-[var(--btn-primary-text)] bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] rounded-xl px-4 py-3 disabled:opacity-50 transition"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
                {loading ? t("sending") : t("kontrolleRequest")}
              </button>
            </div>
          )}

          {/* Verschluss/Sperrzeit Form */}
          {sheet === "verschluss" && (
            <div className="flex flex-col gap-3 px-4 pb-6 pt-1">
              <textarea
                value={nachricht}
                onChange={(e) => setNachricht(e.target.value)}
                placeholder={t("messageLabel")}
                rows={2}
                className="w-full text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-foreground-muted resize-none"
              />
              <div className="flex gap-2 flex-wrap">
                {(art === "ANFORDERUNG" ? ["datum", "dauer"] as const : ["datum", "dauer", "unbefristet"] as const).map((typ) => (
                  <button
                    key={typ}
                    type="button"
                    onClick={() => setDauerTyp(typ)}
                    className={`text-sm px-3 py-1.5 rounded-xl border transition ${
                      dauerTyp === typ
                        ? art === "SPERRZEIT"
                          ? "bg-[var(--color-sperrzeit)] text-foreground-invert border-[var(--color-sperrzeit)]"
                          : "bg-[var(--color-request)] text-foreground-invert border-[var(--color-request)]"
                        : "bg-surface-raised text-foreground-muted border-border hover:border-border-strong"
                    }`}
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
                  className="text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted"
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
                    className="w-28 text-sm bg-surface-raised border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-foreground-muted"
                  />
                  <span className="text-sm text-foreground-faint">{t("kontrolleHours")}</span>
                </div>
              )}
              {error && <p className="text-xs text-warn">{error}</p>}
              <button
                onClick={submitVerschluss}
                disabled={loading}
                className={`flex items-center justify-center gap-2 text-sm font-medium text-[var(--btn-primary-text)] rounded-xl px-4 py-3 disabled:opacity-50 transition ${
                  art === "SPERRZEIT"
                    ? "bg-[var(--color-sperrzeit)] hover:opacity-80"
                    : "bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)]"
                }`}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                {loading ? t("sending") : t("submit")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={sheet === "closed" ? handleOpen : close}
        className={`flex items-center justify-center w-14 h-14 -mt-5 rounded-full shadow-lg transition-all ${
          sheet !== "closed"
            ? "bg-foreground-muted text-background"
            : "bg-foreground text-background hover:opacity-90"
        }`}
        aria-label={sheet === "closed" ? "Aktionen" : "Schliessen"}
      >
        {loading && sheet === "closed"
          ? <Loader2 size={22} className="animate-spin" />
          : sheet !== "closed"
            ? <X size={22} />
            : <Plus size={22} strokeWidth={2} />
        }
      </button>
    </>
  );
}
