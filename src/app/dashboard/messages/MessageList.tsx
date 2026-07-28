"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Bot, CheckCheck, Inbox, Settings, UserRound } from "lucide-react";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import EmptyState from "@/app/components/EmptyState";
import ExpandRow from "@/app/components/ExpandRow";
import ActionModal from "@/app/components/ActionModal";
import FormError from "@/app/components/FormError";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";
import { setAppBadgeSafe } from "@/lib/swMessages";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import type { PresentedMessage } from "@/lib/messagePresenter";
import type { MessageSenderKind } from "@/lib/messageService";

const SENDER_ICON: Record<MessageSenderKind, typeof Bot> = { ai: Bot, keyholder: UserRound, system: Settings };

export default function MessageList({
  initial,
  initialCursor,
  initialUnread,
  tz,
}: {
  initial: PresentedMessage[];
  initialCursor: string | null;
  initialUnread: number;
  /** Zeitzone des Nutzers — Zeitstempel stehen überall in SEINER Zone, nicht in der des Servers. */
  tz: string;
}) {
  const t = useTranslations("messages");
  const tc = useTranslations("common");
  const dl = toDateLocale(useLocale());
  const apiError = useApiError();
  const router = useRouter();

  const [messages, setMessages] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [unread, setUnread] = useState(initialUnread);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  // Das Badge hängt am ZUSTAND, nicht am Klick auf eine Benachrichtigung: wer den Posteingang
  // ansieht, sieht danach die richtige Zahl — auch wenn er über den Push-Tap woanders gelandet war.
  // `router.refresh()` zieht die Glocke im Header nach: die ist eine Server-Komponente und behielte
  // sonst ihren Stand vom Seitenaufruf, während die Liste daneben schon gelesen ist.
  useEffect(() => {
    setAppBadgeSafe(unread);
  }, [unread]);

  // Beim Öffnen des Posteingangs die Glocke im Header nachziehen — und nach jedem Lesevorgang
  // erneut. Der Header steht im geteilten Dashboard-Layout, und das rendert bei einer
  // Client-Navigation NICHT neu: ohne diesen Anstoss zeigte die Glocke ihren Stand vom letzten
  // harten Laden, während die Liste daneben längst weiter ist.
  useEffect(() => {
    router.refresh();
  }, [unread, router]);

  /** Ein Weg für alle drei Aufrufe: Fehler-Code auflösen, Netzfehler benennen, sonst das Ergebnis. */
  async function request<T>(url: string, method: "GET" | "POST" | "DELETE" = "GET"): Promise<T | null> {
    setError(null);
    try {
      const res = await fetch(url, { method });
      if (!res.ok) {
        setError(apiError(await parseApiErrorCode(res)));
        return null;
      }
      return (await res.json()) as T;
    } catch {
      setError(tc("networkError"));
      return null;
    }
  }

  /** Aufklappen IST das Lesen — und nur das. Nicht das Öffnen der Liste, nicht der Push-Tap:
   *  „gelesen" ist bei Nachrichten mit Fristen eine Behauptung mit Konsequenz. */
  async function toggle(m: PresentedMessage) {
    const opening = openId !== m.id;
    setOpenId(opening ? m.id : null);
    if (!opening || m.read) return;
    const res = await request<{ unread: number }>(`/api/messages/${m.id}/read`, "POST");
    if (!res) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
    setUnread(res.unread);
  }

  async function markUnread(m: PresentedMessage) {
    const res = await request<{ unread: number }>(`/api/messages/${m.id}/read`, "DELETE");
    if (!res) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: false } : x)));
    setUnread(res.unread);
  }

  async function markAllRead() {
    setSaving(true);
    const res = await request<{ unread: number }>("/api/messages/read-all", "POST");
    setSaving(false);
    setConfirmAll(false);
    if (!res) return;
    setMessages((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(res.unread);
  }

  async function loadMore() {
    if (!cursor) return;
    setSaving(true);
    // Blättern ändert den Ungelesen-Stand nicht — die Antwort trägt ihn deshalb gar nicht.
    const data = await request<{ messages: PresentedMessage[]; nextCursor: string | null }>(
      `/api/messages?cursor=${encodeURIComponent(cursor)}`,
    );
    setSaving(false);
    if (!data) return;
    setMessages((prev) => [...prev, ...data.messages]);
    setCursor(data.nextCursor);
  }

  // `&& !cursor`: der Sichtbarkeitsfilter kann eine ganze Seite leeren, obwohl weitere folgen —
  // dann ist "Keine Nachrichten" falsch und der Weg zum Nachladen abgeschnitten.
  if (messages.length === 0 && !cursor) {
    return (
      <Card>
        <EmptyState icon={<Inbox size={40} />} title={t("emptyTitle")} description={t("emptyText")} />
      </Card>
    );
  }

  return (
    <>
      {error && <div className="mb-3"><FormError message={error} /></div>}

      <Card padding="none">
        <ul className="divide-y divide-border-subtle">
          {messages.map((m) => {
            const Icon = SENDER_ICON[m.senderKind];
            return (
              <li key={m.id}>
                <ExpandRow
                  open={openId === m.id}
                  onToggle={() => toggle(m)}
                  label={
                    <span className="flex items-start gap-2">
                      {/* Ungelesen dreifach codiert: Punkt, Fettschrift, Text für Screenreader.
                          Farbe allein ist in vier Themes und für Farbfehlsichtige keine Information. */}
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${m.read ? "bg-transparent" : "bg-[var(--color-request)]"}`}
                        aria-hidden="true"
                      />
                      <span className={`min-w-0 ${m.read ? "" : "font-semibold"}`}>
                        {!m.read && <span className="sr-only">{t("unread")} — </span>}
                        {/* line-clamp statt truncate: ein „…" mitten im Straftext schnitte genau die
                            Begründung ab, wegen der es den Posteingang gibt. */}
                        <span className="line-clamp-2">{m.text}</span>
                      </span>
                    </span>
                  }
                  subtitle={
                    <span className="flex items-center gap-1.5 pl-4">
                      <Icon size={12} aria-hidden="true" />
                      {t(`sender.${m.senderKind}`)} · {formatDateTime(m.createdAt, dl, tz)}
                    </span>
                  }
                >
                  <div className="space-y-3">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{m.text}</p>
                    {m.refText && (
                      <p className="text-sm text-foreground-muted whitespace-pre-wrap border-l-2 border-border pl-3">
                        {m.refText}
                      </p>
                    )}
                    {m.refMissing && <p className="text-xs text-foreground-faint">{t("refMissing")}</p>}
                    {m.read && (
                      <Button variant="ghost" size="sm" onClick={() => markUnread(m)}>
                        {t("markUnread")}
                      </Button>
                    )}
                  </div>
                </ExpandRow>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex flex-wrap gap-2 mt-4">
        {unread > 0 && (
          <Button variant="secondary" size="sm" icon={<CheckCheck size={16} />} onClick={() => setConfirmAll(true)}>
            {t("markAllRead")}
          </Button>
        )}
        {cursor && (
          <Button variant="ghost" size="sm" loading={saving} onClick={loadMore}>
            {t("loadMore")}
          </Button>
        )}
      </div>

      {/* Rückfrage, weil „gelesen" hier eine Behauptung ist: zwölf Nachrichten stumm zu quittieren
          erzeugte eine, die hinterher niemand halten kann. */}
      <ActionModal
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title={t("markAllRead")}
        icon={<CheckCheck size={20} className="text-[var(--color-request)]" />}
        iconBg="var(--color-request-bg)"
        theme="user"
      >
        <div className="space-y-4">
          <p className="text-sm text-foreground-muted">{t("markAllConfirm", { count: unread })}</p>
          <div className="flex gap-2">
            <Button variant="primary" loading={saving} onClick={markAllRead}>{tc("yes")}</Button>
            <Button variant="ghost" onClick={() => setConfirmAll(false)}>{tc("cancel")}</Button>
          </div>
        </div>
      </ActionModal>
    </>
  );
}
