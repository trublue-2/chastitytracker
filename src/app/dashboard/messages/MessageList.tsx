"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Bot, CheckCheck, Inbox, ListChecks, Settings, Trash2, Undo2, UserRound, X } from "lucide-react";
import Link from "next/link";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import DetailField from "@/app/components/DetailField";
import EmptyState from "@/app/components/EmptyState";
import ExpandRow from "@/app/components/ExpandRow";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import FormError from "@/app/components/FormError";
import Badge from "@/app/components/Badge";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import Checkbox from "@/app/components/Checkbox";
import ListPager from "@/app/components/ListPager";
import MessageFilterBar from "./MessageFilterBar";
import MessageRow from "./MessageRow";
import useIsClamped from "@/app/hooks/useIsClamped";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";
import { formatDayMonth, formatTime, toDateLocale } from "@/lib/utils";
import type { PresentedMessage } from "@/lib/messagePresenter";
import type { MessageFilter, MessageSenderKind } from "@/lib/messageService";
import { MESSAGE_CATEGORY_PILLS } from "@/lib/messageCategories";

const SENDER_ICON: Record<MessageSenderKind, typeof Bot> = { ai: Bot, keyholder: UserRound, system: Settings };

export default function MessageList({
  initial,
  initialPageCount,
  initialUnread,
  tz,
}: {
  initial: PresentedMessage[];
  initialPageCount: number;
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
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(initialPageCount);
  const [filter, setFilter] = useState<MessageFilter>({});
  const [unread, setUnread] = useState(initialUnread);
  // Die Auswahl als eigener Modus: Kreuzchen an jeder Zeile wären neben dem Ungelesen-Punkt eine
  // zweite runde Marke links und würden die Zeile für den Normalfall verrauschen.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Eigener Zustand: sonst zeigte ein laufendes Nachladen den Lösch-Knopf als beschäftigt.
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  // Die zu löschende Nachricht — hält gleichzeitig die Rückfrage offen (eine Quelle statt
  // Flag + Id nebeneinander).
  const [confirmDelete, setConfirmDelete] = useState<PresentedMessage | null>(null);

  // Beim Öffnen des Posteingangs die Glocke im Header nachziehen — und nach jedem Lesevorgang
  // erneut. Der Header steht im geteilten Dashboard-Layout, und das rendert bei einer
  // Client-Navigation NICHT neu: ohne diesen Anstoss zeigte die Glocke ihren Stand vom letzten
  // harten Laden, während die Liste daneben längst weiter ist.
  //
  // Das App-Badge schreibt diese Seite BEWUSST nicht selbst: es hat genau einen Schreiber
  // (AppBadgeSync am Header, mit dem Server-Stand). Zwei Schreiber — hier der Client-State, dort
  // der Server-Wert — könnten sich bei schnell hintereinander gelesenen Nachrichten überholen und
  // die Zahl wieder hochsetzen. Der `refresh()` unten liefert dem einen Schreiber den frischen Wert.
  useEffect(() => {
    router.refresh();
  }, [unread, router]);

  /** Ein Weg für alle drei Aufrufe: Fehler-Code auflösen, Netzfehler benennen, sonst das Ergebnis. */
  async function request<T>(url: string, method: "GET" | "POST" | "DELETE" = "GET", body?: unknown): Promise<T | null> {
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
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

  async function deleteMessage(m: PresentedMessage) {
    setDeleting(true);
    const res = await request<{ unread: number }>(`/api/messages/${m.id}`, "DELETE");
    setDeleting(false);
    // Die Rückfrage bleibt bei einem Fehler OFFEN: schlösse sie sich, sähe der Nutzer eine
    // unveränderte Liste und keinen Grund — die Fehlerzeile steht am Listenkopf, womöglich
    // ausserhalb des Bildes.
    if (!res) return;
    setConfirmDelete(null);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    setUnread(res.unread);
  }

  /**
   * Eine Seite holen — der EINE Weg, über den Blättern und Filtern laufen.
   *
   * Die Seite kommt aus der Antwort zurück, nicht aus der Anfrage: der Server klemmt sie ans Ende,
   * wenn die angefragte hinter dem letzten Eintrag liegt (nach dem Löschen der letzten Zeile einer
   * Seite). Die Auswahl fällt dabei weg — angekreuzt wurde auf der Seite, die man verlässt.
   */
  async function load(nextPage: number, nextFilter: MessageFilter = filter) {
    setSaving(true);
    const params = new URLSearchParams({ page: String(nextPage) });
    if (nextFilter.unreadOnly) params.set("unread", "1");
    if (nextFilter.category) params.set("category", nextFilter.category);
    if (nextFilter.senderKind) params.set("sender", nextFilter.senderKind);
    const data = await request<{ messages: PresentedMessage[]; page: number; pageCount: number }>(
      `/api/messages?${params.toString()}`,
    );
    setSaving(false);
    if (!data) return;
    setMessages(data.messages);
    setPage(data.page);
    setPageCount(data.pageCount);
    setSelected(new Set());
    setOpenId(null);
  }

  function applyFilter(next: MessageFilter) {
    setFilter(next);
    // Immer zurück auf Seite 1: ein Filter, der die Liste kürzt, liesse einen sonst auf einer Seite
    // stehen, die es nicht mehr gibt.
    void load(1, next);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Massen-Aktion über die angekreuzten Zeilen. Danach die Seite frisch holen: Löschen verschiebt
   *  alles Nachfolgende nach vorn, und der Gelesen-Zustand kann bei aktivem Ungelesen-Filter eine
   *  Zeile von der Seite nehmen. */
  async function bulk(action: "delete" | "read" | "unread") {
    if (selected.size === 0) return;
    setDeleting(action === "delete");
    setSaving(true);
    const res = await request<{ unread: number }>("/api/messages/bulk", "POST", { ids: [...selected], action });
    setSaving(false);
    setDeleting(false);
    setConfirmBulkDelete(false);
    if (!res) return;
    setUnread(res.unread);
    await load(page);
  }

  const filtered = Boolean(filter.unreadOnly || filter.category || filter.senderKind);
  // Der Leer-Zustand darf nicht behaupten, es GEBE keine Nachrichten, wenn nur der Filter greift —
  // und er darf die Filterleiste nicht mitnehmen, sonst kommt man aus dem leeren Filter nicht heraus.
  const empty = messages.length === 0 && pageCount <= 1;

  return (
    <>
      {error && <div className="mb-3"><FormError message={error} /></div>}

      <MessageFilterBar filter={filter} onChange={applyFilter} disabled={saving} />

      {empty ? (
        <Card>
          <EmptyState
            icon={<Inbox size={40} />}
            title={filtered ? t("emptyFilteredTitle") : t("emptyTitle")}
            description={filtered ? t("emptyFilteredText") : t("emptyText")}
          />
        </Card>
      ) : (
      <Card padding="none">
        {selecting && (
          // Die Aktionsleiste steht ÜBER der Liste, nicht darunter: sie gehört zur Auswahl, und wer
          // in einer langen Liste ankreuzt, soll nicht ans Ende scrollen müssen, um sie zu finden.
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border-subtle bg-surface-raised">
            <span className="text-xs font-medium text-foreground-muted tabular-nums">
              {t("selectedCount", { count: selected.size })}
            </span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" disabled={selected.size === 0 || saving} onClick={() => bulk("read")}>
              {t("bulkRead")}
            </Button>
            <Button variant="ghost" size="sm" disabled={selected.size === 0 || saving} onClick={() => bulk("unread")}>
              {t("bulkUnread")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={16} />}
              disabled={selected.size === 0 || saving}
              onClick={() => setConfirmBulkDelete(true)}
            >
              {tc("delete")}
            </Button>
          </div>
        )}

        <ul className="divide-y divide-border-subtle">
          {messages.map((m) => (
            <li key={m.id}>
              <MessageRow
                message={m}
                open={openId === m.id}
                selecting={selecting}
                checked={selected.has(m.id)}
                onCheck={() => toggleSelected(m.id)}
                onToggle={() => toggle(m)}
                onMarkUnread={() => markUnread(m)}
                onDelete={() => setConfirmDelete(m)}
                dl={dl}
                tz={tz}
              />
            </li>
          ))}
        </ul>

        <ListPager page={page - 1} totalPages={pageCount} onPage={(p) => load(p + 1)} />
      </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        {unread > 0 && !selecting && (
          <Button variant="secondary" size="sm" icon={<CheckCheck size={16} />} onClick={() => setConfirmAll(true)}>
            {t("markAllRead")}
          </Button>
        )}
        {!empty && (
          <Button
            variant="ghost"
            size="sm"
            icon={selecting ? <X size={16} /> : <ListChecks size={16} />}
            onClick={() => { setSelecting((v) => !v); setSelected(new Set()); }}
          >
            {selecting ? tc("cancel") : t("select")}
          </Button>
        )}
      </div>

      {/* Massen-Löschen: dieselbe Rückfrage wie beim Einzelnen, nur mit der Zahl — endgültig bleibt
          endgültig, auch wenn man zwölf Zeilen auf einmal meint. */}
      <ConfirmDialog
        open={confirmBulkDelete}
        title={tc("delete")}
        message={t("bulkDeleteConfirm", { count: selected.size })}
        confirmLabel={tc("delete")}
        danger
        loading={deleting}
        icon={<Trash2 size={20} style={{ color: "var(--color-warn)" }} />}
        onConfirm={() => bulk("delete")}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {/* Rückfrage, weil „gelesen" hier eine Behauptung ist: zwölf Nachrichten stumm zu quittieren
          erzeugte eine, die hinterher niemand halten kann. */}
      <ConfirmDialog
        open={confirmAll}
        title={t("markAllRead")}
        message={t("markAllConfirm", { count: unread })}
        confirmLabel={tc("yes")}
        loading={saving}
        icon={<CheckCheck size={20} style={{ color: "var(--color-warn)" }} />}
        onConfirm={markAllRead}
        onCancel={() => setConfirmAll(false)}
      />

      {/* Endgültig, deshalb mit Rückfrage — und mit dem Grund, warum sie hier mehr wiegt als beim
          Löschen eines Eintrags: das Strafbuch ist admin-only, für den Sub war die Nachricht der
          einzige Ort, an dem der Straftext stand. Der Vorgang selbst bleibt in der Datenbank. */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title={tc("delete")}
        message={t("deleteConfirm")}
        confirmLabel={tc("delete")}
        danger
        loading={deleting}
        icon={<Trash2 size={20} style={{ color: "var(--color-warn)" }} />}
        onConfirm={() => confirmDelete && deleteMessage(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}
