"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Bot, CheckCheck, Inbox, Settings, Trash2, Undo2, UserRound } from "lucide-react";
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
import { useApiError } from "@/app/hooks/useApiError";
import { parseApiErrorCode } from "@/lib/apiClient";
import { formatDayMonth, formatTime, toDateLocale } from "@/lib/utils";
import type { PresentedMessage } from "@/lib/messagePresenter";
import type { MessageSenderKind } from "@/lib/messageService";
import { MESSAGE_CATEGORY_PILLS } from "@/lib/messageCategories";

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
            const cat = MESSAGE_CATEGORY_PILLS[m.category];
            const open = openId === m.id;
            // Ein Bezug (Text oder Fehl-Hinweis) ist optional — viele Nachrichten haben bewusst
            // keinen (siehe orgasmusAnforderungService: Rückzug ohne refId).
            const hasRef = Boolean(m.refText) || m.refMissing;
            return (
              <li key={m.id}>
                <ExpandRow
                  open={open}
                  onToggle={() => toggle(m)}
                  actions={
                    <RowActionsMenu
                      items={[
                        ...(m.read
                          ? [{ label: t("markUnread"), icon: <Undo2 size={14} className="text-foreground-faint" />, onSelect: () => markUnread(m) }]
                          : []),
                        { label: tc("delete"), icon: <Trash2 size={14} />, onSelect: () => setConfirmDelete(m), danger: true },
                      ]}
                    />
                  }
                  label={
                    <span className="flex items-start gap-2">
                      {/* Ungelesen dreifach codiert: Punkt, Fettschrift, Text für Screenreader.
                          Farbe allein ist in vier Themes und für Farbfehlsichtige keine Information. */}
                      <span
                        className={`mt-2 w-2 h-2 rounded-full shrink-0 ${m.read ? "bg-transparent" : "bg-warn"}`}
                        aria-hidden="true"
                      />
                      {/* text-base: der Meldungstext ist die Überschrift der Zeile und muss sich von
                          der text-xs-Metazeile und dem text-sm-Bezug deutlich abheben. */}
                      <span className={`min-w-0 text-base ${m.read ? "font-medium" : "font-semibold"}`}>
                        {!m.read && <span className="sr-only">{t("unread")} — </span>}
                        {/* Zu ist die Zeile eine Vorschau, offen der ganze Text — der Text steht
                            deshalb GENAU EINMAL da und wird im Panel nicht wiederholt. line-clamp
                            statt truncate: ein „…" mitten im Straftext schnitte genau die
                            Begründung ab, wegen der es den Posteingang gibt. */}
                        <span className={open ? "whitespace-pre-wrap" : "line-clamp-2"}>{m.text}</span>
                      </span>
                    </span>
                  }
                  subtitle={
                    // pl-4 = Punkt + gap: die Metazeile hängt unter dem Titel, nicht unter dem Punkt.
                    // flex-wrap, weil Kategorie + Absender + Datum auf 390 px sonst überlaufen.
                    <span className="flex items-center flex-wrap gap-x-1.5 gap-y-1 pl-4">
                      <Badge size="sm" label={t(cat.labelKey)} variant={cat.variant} />
                      {/* Icon, Absender und Zeit als EINE Einheit: bricht die Zeile, fällt der Umbruch
                          zwischen Kategorie und Absender — nie zwischen Icon und Name.

                          Die Absender-Angabe bleibt neben der Kategorie stehen: dass die KI geurteilt
                          hat, ist eine Zusicherung und wird nicht durch das Thema ersetzt.

                          Tag + Uhrzeit ohne Jahr (dieselbe Kurzform wie die Banner über
                          `formatDayTimeDual`) — mit Jahr bricht die Zeile auf 390 px zusätzlich um. */}
                      <span className="inline-flex items-center gap-1.5">
                        <Icon size={12} aria-hidden="true" />
                        {t(`sender.${m.senderKind}`)} · {formatDayMonth(m.createdAt, dl, tz)} {formatTime(m.createdAt, dl, tz)}
                      </span>
                    </span>
                  }
                >
                  {/* Ohne Trennlinie: der Abstand setzt das Aufgeklappte ab. Der Inhalt beginnt bei
                      pl-4 auf der Titelkante — nie links davon.

                      Bedingungslos gerendert: `ExpandRow` zeigt sein Panel allein nach `open`,
                      unabhängig davon, ob Inhalt kommt. Hing der Inhalt an `m.read`, leerte ein Klick
                      auf „wieder als ungelesen" das Panel unter dem Finger. Es gibt immer mindestens
                      etwas — heute den Bezug bzw. den Link, sonst nichts, und das ist in Ordnung. */}
                  <div className="pt-1 space-y-3">
                    {hasRef && (
                      <div className="pl-4">
                        <DetailField label={t("refLabel")}>
                          {m.refText ? (
                            <p className="text-sm text-foreground-muted whitespace-pre-wrap border-l-2 border-border pl-3">
                              {m.refText}
                            </p>
                          ) : (
                            <p className="text-sm text-foreground-faint italic">{t("refMissing")}</p>
                          )}
                        </DetailField>
                      </div>
                    )}
                    {/* Verlinkt wird nur, wo eine Seite etwas beiträgt — heute die offene Kontrolle
                        mit vorbelegtem Code. Der Link steht IM Panel, nicht im Titel: dessen
                        Aufklapp-Fläche ist ein `button`, ein `a` darin wäre ungültiges Markup und
                        würde den Klick verschlucken. */}
                    {m.refHref && (
                      <Link
                        href={m.refHref}
                        className="inline-flex items-center gap-1.5 pl-4 text-sm font-medium text-[var(--color-inspect)] hover:underline"
                      >
                        {t("openTarget")}
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
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
