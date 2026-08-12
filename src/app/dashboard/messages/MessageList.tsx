"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CheckCheck, Inbox, ListChecks, Trash2, X } from "lucide-react";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import EmptyState from "@/app/components/EmptyState";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import FormError from "@/app/components/FormError";
import ListPager from "@/app/components/ListPager";
import MessageFilterBar from "./MessageFilterBar";
import MessageRow from "./MessageRow";
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";
import { toDateLocale } from "@/lib/utils";
import type { PresentedMessage } from "@/lib/messagePresenter";
import { isMessageFiltered, messageFilterToParams, type MessageFilter } from "@/lib/messageCategories";


export default function MessageList({
  initial,
  initialPageCount,
  initialUnread,
  initialFilter = {},
  tz,
}: {
  initial: PresentedMessage[];
  initialPageCount: number;
  initialUnread: number;
  /** Der Filter aus der Adresse (`?category=…`), mit dem die Seite schon serverseitig gefiltert
   *  wurde. Muss hier als Startwert ankommen, sonst zeigte die Filterleiste „alle Kategorien" über
   *  einer gefilterten Liste — und das erste Blättern hätte den Filter verloren. */
  initialFilter?: MessageFilter;
  /** Zeitzone des Nutzers — Zeitstempel stehen überall in SEINER Zone, nicht in der des Servers. */
  tz: string;
}) {
  const t = useTranslations("messages");
  const tc = useTranslations("common");
  const dl = toDateLocale(useLocale());
  const apiError = useApiError();
  const router = useRouter();

  const [messages, setMessages] = useState(initial);
  // NULLBASIERT wie bei allen acht `ListPager`-Verwendungen; die Umrechnung auf die 1-basierte
  // Zählung des Servers steht an genau einer Stelle: beim Bau der Anfrage in `load`.
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(initialPageCount);
  const [filter, setFilter] = useState<MessageFilter>(initialFilter);
  const [unread, setUnread] = useState(initialUnread);
  // EIN Zustand für „Auswahl-Modus" UND „was ist angekreuzt": `null` = kein Modus. Als zwei
  // Variablen musste die Kopplung („Modus verlassen = Auswahl leeren") von Hand gehalten werden —
  // ein zweiter Ausstiegspfad, der die zweite Zeile vergisst, liesse eine unsichtbare Auswahl
  // liegen, mit der die Massen-Aktion weiterarbeitet.
  //
  // Kreuzchen erscheinen nur im Modus: an jeder Zeile wären sie neben dem Ungelesen-Punkt eine
  // zweite runde Marke links und würden die Zeile für den Normalfall verrauschen.
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Eigener Zustand: sonst zeigte ein laufendes Nachladen den Lösch-Knopf als beschäftigt.
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  // Die In-Flight-Marke als REF, nicht als State: `saving` stammt aus dem Render und ist für zwei
  // Klicks aus demselben Render in beiden `false` — eine Schranke darauf lässt genau den Doppel-
  // Abruf durch, den sie verhindern soll. Das Ref ist sofort nach dem ersten Klick gesetzt.
  const loadInFlight = useRef(false);
  // Was gelöscht werden soll — hält gleichzeitig die Rückfrage offen (eine Quelle statt Flag + Id
  // nebeneinander). `"bulk"` steht für die Auswahl; beide Fälle teilen sich einen Dialog, der sich
  // nur in Text und Ziel unterscheidet.
  const [confirmDelete, setConfirmDelete] = useState<PresentedMessage | "bulk" | null>(null);

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

  /** Als gelesen, ohne aufzuklappen — für Zeilen, die nichts aufzuklappen haben. Derselbe Endpunkt,
   *  den `toggle` beim Öffnen ruft. */
  async function markRead(m: PresentedMessage) {
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
    // Zweimal schnell auf „Weiter" wären zwei vollständige Runden; träfen die Antworten verkehrt
    // herum ein, zeigte die Liste eine andere Seite als der Zähler daneben.
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    setSaving(true);
    // Serialisierung aus `messageCategories` — dieselbe Quelle, die die Route wieder einliest.
    const params = messageFilterToParams(nextFilter);
    params.set("page", String(nextPage + 1));
    const data = await request<{ messages: PresentedMessage[]; page: number; pageCount: number }>(
      `/api/messages?${params.toString()}`,
    );
    loadInFlight.current = false;
    setSaving(false);
    if (!data) return;
    setMessages(data.messages);
    setPage(data.page - 1);
    setPageCount(data.pageCount);
    setSelected((prev) => (prev === null ? null : new Set()));
    setOpenId(null);
  }

  function applyFilter(next: MessageFilter) {
    setFilter(next);
    // Immer zurück auf die erste Seite: ein Filter, der die Liste kürzt, liesse einen sonst auf
    // einer Seite stehen, die es nicht mehr gibt.
    void load(0, next);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Massen-Aktion über die angekreuzten Zeilen. Danach die Seite frisch holen: Löschen verschiebt
   *  alles Nachfolgende nach vorn, und der Gelesen-Zustand kann bei aktivem Ungelesen-Filter eine
   *  Zeile von der Seite nehmen. */
  async function bulk(action: "delete" | "read" | "unread") {
    const ids = selected ? [...selected] : [];
    if (ids.length === 0) return;
    setDeleting(action === "delete");
    setSaving(true);
    const res = await request<{ unread: number }>("/api/messages/bulk", "POST", { ids, action });
    setDeleting(false);
    setSaving(false);
    if (!res) return;
    // Erst nach der Fehlerprüfung schliessen — bei einem Fehler bleibt die Rückfrage stehen, sonst
    // sähe der Nutzer eine unveränderte Liste und keinen Grund (dieselbe Regel wie beim Einzelnen).
    setConfirmDelete(null);
    setUnread(res.unread);
    // Nur Löschen (verschiebt alles Nachfolgende) und der Ungelesen-Filter (nimmt die Zeile von der
    // Seite) brauchen die Liste frisch. Beim blossen Gelesen-Flag reicht der lokale Patch — genau
    // das tut `markAllRead` ein paar Zeilen weiter oben schon.
    if (action === "delete" || filter.unreadOnly) {
      await load(page);
      return;
    }
    const touched = new Set(ids);
    setMessages((prev) => prev.map((m) => (touched.has(m.id) ? { ...m, read: action === "read" } : m)));
    setSelected((prev) => (prev === null ? null : new Set()));
  }

  const filtered = isMessageFiltered(filter);
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
        {selected !== null && (
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
              onClick={() => setConfirmDelete("bulk")}
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
                selecting={selected !== null}
                checked={selected?.has(m.id) ?? false}
                onCheck={() => toggleSelected(m.id)}
                onToggle={() => toggle(m)}
                onMarkRead={() => markRead(m)}
                onMarkUnread={() => markUnread(m)}
                onDelete={() => setConfirmDelete(m)}
                dl={dl}
                tz={tz}
              />
            </li>
          ))}
        </ul>

        <ListPager page={page} totalPages={pageCount} onPage={load} disabled={saving} />
      </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-4">
        {unread > 0 && selected === null && (
          <Button variant="secondary" size="sm" icon={<CheckCheck size={16} />} onClick={() => setConfirmAll(true)}>
            {t("markAllRead")}
          </Button>
        )}
        {!empty && (
          <Button
            variant="ghost"
            size="sm"
            icon={selected !== null ? <X size={16} /> : <ListChecks size={16} />}
            onClick={() => setSelected((prev) => (prev === null ? new Set() : null))}
          >
            {selected !== null ? tc("cancel") : t("select")}
          </Button>
        )}
      </div>


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
          einzige Ort, an dem der Straftext stand. Der Vorgang selbst bleibt in der Datenbank.

          EIN Dialog für die einzelne Zeile UND die Auswahl: zwei unterschieden sich in drei von
          acht Eigenschaften — und waren beim ersten Mal schon auseinandergelaufen (der eine schloss
          vor der Fehlerprüfung, der andere ausdrücklich danach). */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title={tc("delete")}
        message={confirmDelete === "bulk" ? t("bulkDeleteConfirm", { count: selected?.size ?? 0 }) : t("deleteConfirm")}
        confirmLabel={tc("delete")}
        danger
        loading={deleting}
        icon={<Trash2 size={20} style={{ color: "var(--color-warn)" }} />}
        onConfirm={() => (confirmDelete === "bulk" ? bulk("delete") : confirmDelete && deleteMessage(confirmDelete))}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}
