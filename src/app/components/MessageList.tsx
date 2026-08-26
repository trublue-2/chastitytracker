"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CheckCheck, Inbox, ListChecks, Trash2, X } from "lucide-react";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import Checkbox from "@/app/components/Checkbox";
import EmptyState from "@/app/components/EmptyState";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import FormError from "@/app/components/FormError";
import ListPager from "@/app/components/ListPager";
import MessageFilterBar from "./MessageFilterBar";
import MessageRow from "./MessageRow";
import { useApiError } from "@/app/hooks/useApiError";
import useToast from "@/app/hooks/useToast";
import { parseApiErrorCode } from "@/lib/apiClient";
import { toDateLocale } from "@/lib/utils";
import type { PresentedMessage } from "@/lib/messagePresenter";
import { isMessageFiltered, messageFilterToParams, type MessageFilter } from "@/lib/messageCategories";
import { MESSAGE_SCOPES, type MessageScope } from "@/lib/messageScope";

/** Welche Rückmeldung eine abgeschlossene Sammel-Aktion gibt — eine Zeile je Aktion, damit die
 *  Meldung die Tat benennt („3 gelöscht") statt eines nichtssagenden „Erledigt". */
const BULK_DONE_KEY = {
  delete: "bulkDoneDelete",
  read: "bulkDoneRead",
  unread: "bulkDoneUnread",
} as const;

export default function MessageList({
  initial,
  initialPageCount,
  initialUnread,
  initialUnreadInFilter,
  initialFilter = {},
  scope,
  aiSenderAvailable,
  keyholderName,
  tz,
}: {
  initial: PresentedMessage[];
  initialPageCount: number;
  initialUnread: number;
  /** Ungelesene im WIRKSAMEN Ausschnitt — das ist die Zahl, die „Alle als gelesen markieren"
   *  tatsächlich anfasst, seit der Endpunkt den Filter respektiert. Ohne aktiven Filter dieselbe
   *  wie `initialUnread`, mit Filter eine andere: die Rückfrage nannte sonst neun, wo eine Zeile
   *  auf dem Schirm stand. */
  initialUnreadInFilter: number;
  /** Der Filter aus der Adresse (`?category=…`), mit dem die Seite schon serverseitig gefiltert
   *  wurde. Muss hier als Startwert ankommen, sonst zeigte die Filterleiste „alle Kategorien" über
   *  einer gefilterten Liste — und das erste Blättern hätte den Filter verloren. */
  initialFilter?: MessageFilter;
  /** WESSEN Posteingang bedient wird — der eigene oder der des Keyholders über seine Träger. Die
   *  Endpunkt-Familie leitet die Liste daraus ab (`MESSAGE_SCOPES`), statt sie sich sagen zu lassen:
   *  Ziel, API-Basis und Beschriftung derselben Sicht liegen damit in EINER Tabelle. Der Scope
   *  selbst steckt AUSSCHLIESSLICH im Endpunkt — beide Familien leiten ihn serverseitig aus der
   *  Session ab, diese Komponente schickt nie eine Kennung mit. */
  scope: MessageScope;
  /** Nur durchgereicht — die Filterleiste (beides) und die Zeile (`keyholderName`) sind
   *  Client-Komponenten und können weder die Instanz-Konfiguration noch die Keyholder-Zuordnung
   *  selbst lesen. EIN Ladeweg für beide Anzeigen, nicht zwei. */
  aiSenderAvailable: boolean;
  keyholderName: string | null;
  /** Zeitzone des Nutzers — Zeitstempel stehen überall in SEINER Zone, nicht in der des Servers. */
  tz: string;
}) {
  const t = useTranslations("messages");
  const tc = useTranslations("common");
  const dl = toDateLocale(useLocale());
  const apiError = useApiError();
  const toast = useToast();
  const router = useRouter();
  const apiBase = MESSAGE_SCOPES[scope].apiBase;

  const [messages, setMessages] = useState(initial);
  // NULLBASIERT wie bei allen acht `ListPager`-Verwendungen; die Umrechnung auf die 1-basierte
  // Zählung des Servers steht an genau einer Stelle: beim Bau der Anfrage in `load`.
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(initialPageCount);
  const [filter, setFilter] = useState<MessageFilter>(initialFilter);
  const [unread, setUnread] = useState(initialUnread);
  // Der Ausschnitts-Zähler steht NEBEN dem Gesamtstand, statt ihn zu ersetzen: die Glocke im Header
  // zeigt weiterhin alles, die Rückfrage nur das, was der Filter zeigt.
  const [unreadInFilter, setUnreadInFilter] = useState(initialUnreadInFilter);
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
  // Sprungziel nach einem Seitenwechsel: wer auf „Weiter" tippt, stand am ENDE der alten Seite und
  // landete ohne das mitten in der neuen — sichtbar war Zeile 15 von 20, der Kopf lag oberhalb.
  const listRef = useRef<HTMLDivElement>(null);
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

  /** Die Antwort einer Lese-Aktion beiden Zählern zuführen.
   *
   *  Den Gesamtstand nennt der Server. Den Ausschnitt rechnet der Aufrufer mit — er weiss, welche
   *  Zeilen er angefasst hat und ob sie ungelesen waren. Liefert die Route das Feld eines Tages
   *  selbst mit, gewinnt sie: die Rechnung hier ist die Krücke, solange sie es nicht tut. */
  function applyUnread(res: { unread: number; unreadInFilter?: number }, inFilter: number) {
    setUnread(res.unread);
    setUnreadInFilter(Math.max(0, res.unreadInFilter ?? inFilter));
  }

  /** Aufklappen IST das Lesen — und nur das. Nicht das Öffnen der Liste, nicht der Push-Tap:
   *  „gelesen" ist bei Nachrichten mit Fristen eine Behauptung mit Konsequenz. */
  async function toggle(m: PresentedMessage) {
    const opening = openId !== m.id;
    setOpenId(opening ? m.id : null);
    if (!opening || m.read) return;
    const res = await request<{ unread: number }>(`${apiBase}/${m.id}/read`, "POST");
    if (!res) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
    applyUnread(res, unreadInFilter - 1);
  }

  /** Als gelesen, ohne aufzuklappen — für Zeilen, die nichts aufzuklappen haben. Derselbe Endpunkt,
   *  den `toggle` beim Öffnen ruft. */
  async function markRead(m: PresentedMessage) {
    const res = await request<{ unread: number }>(`${apiBase}/${m.id}/read`, "POST");
    if (!res) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
    applyUnread(res, unreadInFilter - (m.read ? 0 : 1));
  }

  async function markUnread(m: PresentedMessage) {
    const res = await request<{ unread: number }>(`${apiBase}/${m.id}/read`, "DELETE");
    if (!res) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: false } : x)));
    applyUnread(res, unreadInFilter + (m.read ? 1 : 0));
  }

  /** Quittiert genau das, was der Filter zeigt — deshalb geht er MIT an den Endpunkt, aus derselben
   *  Serialisierung wie beim Blättern. Ohne die Parameter läse der Server den ungefilterten
   *  Posteingang und quittierte Zeilen, die niemand vor sich hatte. */
  async function markAllRead() {
    setSaving(true);
    const params = messageFilterToParams(filter).toString();
    const res = await request<{ unread: number }>(`${apiBase}/read-all${params ? `?${params}` : ""}`, "POST");
    setSaving(false);
    setConfirmAll(false);
    if (!res) return;
    applyUnread(res, 0);
    // Unter dem Ungelesen-Filter nimmt das Quittieren den Zeilen ihre Zugehörigkeit: sie gehören
    // nicht mehr in die Liste, die man ansieht. Ein reiner lokaler Patch liesse sie stehen — zwanzig
    // als gelesen markierte Zeilen unter einer Überschrift, die „nur ungelesene" verspricht, und
    // eine Seitenzahl, die weiter „1 / 3" behauptet, während der Server keine drei Seiten mehr hat.
    // `bulk` macht es an derselben Stelle schon richtig; hier fehlte die Symmetrie.
    if (filter.unreadOnly) {
      await load(page, filter, { quiet: true });
      return;
    }
    setMessages((prev) => prev.map((x) => ({ ...x, read: true })));
  }

  async function deleteMessage(m: PresentedMessage) {
    setDeleting(true);
    const res = await request<{ unread: number }>(`${apiBase}/${m.id}`, "DELETE");
    setDeleting(false);
    // Die Rückfrage bleibt bei einem Fehler OFFEN: schlösse sie sich, sähe der Nutzer eine
    // unveränderte Liste und keinen Grund — die Fehlerzeile steht am Listenkopf, womöglich
    // ausserhalb des Bildes.
    if (!res) return;
    setConfirmDelete(null);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    applyUnread(res, unreadInFilter - (m.read ? 0 : 1));
  }

  /**
   * Eine Seite holen — der EINE Weg, über den Blättern und Filtern laufen.
   *
   * Die Seite kommt aus der Antwort zurück, nicht aus der Anfrage: der Server klemmt sie ans Ende,
   * wenn die angefragte hinter dem letzten Eintrag liegt (nach dem Löschen der letzten Zeile einer
   * Seite). Die Auswahl fällt dabei weg — angekreuzt wurde auf der Seite, die man verlässt.
   */
  async function load(nextPage: number, nextFilter: MessageFilter = filter, opts: { quiet?: boolean } = {}) {
    // Zweimal schnell auf „Weiter" wären zwei vollständige Runden; träfen die Antworten verkehrt
    // herum ein, zeigte die Liste eine andere Seite als der Zähler daneben.
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    setSaving(true);
    // Serialisierung aus `messageCategories` — dieselbe Quelle, die die Route wieder einliest.
    const params = messageFilterToParams(nextFilter);
    params.set("page", String(nextPage + 1));
    const data = await request<{
      messages: PresentedMessage[];
      page: number;
      pageCount: number;
      // Beide Zähler sind OPTIONAL: die Route liefert sie noch nicht, und eine harte Erwartung
      // liesse die Liste an einem fehlenden Feld scheitern statt am Fehlen der Zahl.
      unread?: number;
      unreadInFilter: number;
    }>(`${apiBase}?${params.toString()}`);
    loadInFlight.current = false;
    setSaving(false);
    if (!data) return;
    setMessages(data.messages);
    setPage(data.page - 1);
    setPageCount(data.pageCount);
    // Der Listen-Endpunkt nennt den Ausschnitt selbst (`makeInboxRoutes.list`) — hier stand ein
    // Ausweichpfad mit eigener Schätzung und dem Kommentar „bis die Route ihn liefert". Sie liefert
    // ihn; der Zweig war von der ersten Zeile an unerreichbar. Die Schätzung bleibt dort, wo sie
    // gebraucht wird: bei den Einzel-Aktionen (`applyUnread`), deren Endpunkte nur den Gesamtstand
    // zurückgeben.
    setUnreadInFilter(data.unreadInFilter);
    // Die Auswahl galt für die Seite, die man verlässt — sie stumm fallen zu lassen sah aus wie ein
    // Fehler: die Kreuzchen waren weg, die Zählung stand auf null, und niemand hatte etwas getan.
    if (!opts.quiet && (selected?.size ?? 0) > 0) toast.info(t("selectionCleared"));
    setSelected((prev) => (prev === null ? null : new Set()));
    setOpenId(null);
    // Nur beim echten Seitenwechsel: nach einem Filterwechsel auf derselben Seitennummer steht man
    // ohnehin am Anfang, und beim ersten Rendern läuft `load` gar nicht.
    if (data.page - 1 !== page) listRef.current?.scrollIntoView({ block: "start" });
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
    const res = await request<{ unread: number; affected: number }>(`${apiBase}/bulk`, "POST", { ids, action });
    setDeleting(false);
    setSaving(false);
    if (!res) return;
    // Erst nach der Fehlerprüfung schliessen — bei einem Fehler bleibt die Rückfrage stehen, sonst
    // sähe der Nutzer eine unveränderte Liste und keinen Grund (dieselbe Regel wie beim Einzelnen).
    setConfirmDelete(null);
    // Was die Aktion am Ausschnitt geändert hat, weiss nur diese Seite: welche der angekreuzten
    // Zeilen ungelesen waren, steht in der Liste, nicht in der Antwort.
    const wasUnread = new Set(messages.filter((m) => !m.read).map((m) => m.id));
    const flipped = ids.filter((id) => (action === "unread" ? !wasUnread.has(id) : wasUnread.has(id))).length;
    applyUnread(res, action === "unread" ? unreadInFilter + flipped : unreadInFilter - flipped);
    // Den Auswahl-Modus VERLASSEN: sonst blieb der Block mit vier ausgegrauten Knöpfen und
    // „0 ausgewählt" stehen, und ob gelöscht oder nur weggefiltert wurde, war nicht zu erkennen.
    setSelected(null);
    setOpenId(null);
    toast.success(t(BULK_DONE_KEY[action], { count: res.affected }));
    // Nur Löschen (verschiebt alles Nachfolgende) und der Ungelesen-Filter (nimmt die Zeile von der
    // Seite) brauchen die Liste frisch. Beim blossen Gelesen-Flag reicht der lokale Patch — genau
    // das tut `markAllRead` ein paar Zeilen weiter oben schon.
    if (action === "delete" || filter.unreadOnly) {
      // `quiet`: die Auswahl ist hier nicht verlorengegangen, sie wurde gerade ausgeführt — die
      // Notiz von oben wäre eine zweite, widersprüchliche Meldung neben „3 gelöscht".
      await load(page, filter, { quiet: true });
      return;
    }
    const touched = new Set(ids);
    setMessages((prev) => prev.map((m) => (touched.has(m.id) ? { ...m, read: action === "read" } : m)));
  }

  const filtered = isMessageFiltered(filter);
  // „Alle auf dieser Seite" ist gesetzt, wenn keine Zeile mehr fehlt — ein Zwischenzustand („einige")
  // fällt weg, weil das Kästchen ihn nicht darstellen kann.
  const allOnPageSelected = messages.length > 0 && messages.every((m) => selected?.has(m.id));
  // Der Leer-Zustand darf nicht behaupten, es GEBE keine Nachrichten, wenn nur der Filter greift —
  // und er darf die Filterleiste nicht mitnehmen, sonst kommt man aus dem leeren Filter nicht heraus.
  const empty = messages.length === 0 && pageCount <= 1;

  return (
    <>
      {error && <div className="mb-3"><FormError message={error} /></div>}

      <MessageFilterBar
        filter={filter}
        onChange={applyFilter}
        disabled={saving}
        scope={scope}
        aiSenderAvailable={aiSenderAvailable}
        keyholderName={keyholderName}
      />

      {/* Auswahl-Einstieg und Sammel-Quittung stehen ÜBER der Liste, in derselben Kante, in der
          gleich die Aktionsleiste erscheint. Darunter lagen sie bei zwanzig Meldungen rund 1650 px
          tiefer, und das Antippen schob den Knopf noch einmal weg. Der Auswahl-Knopf steht ZUERST:
          so bleibt er an seinem Platz, wenn „Alle als gelesen markieren" im Modus verschwindet. */}
      {(!empty || (unreadInFilter > 0 && selected === null)) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {!empty && (
            <Button
              variant="ghost"
              size="sm"
              icon={selected !== null ? <X size={16} /> : <ListChecks size={16} />}
              // Auch `openId` fallen lassen. `MessageRow` UNTERDRÜCKT das Panel im Auswahlmodus
              // nur (`open && !selecting`) — beim Verlassen käme eine vor Minuten geöffnete Zeile
              // von selbst wieder hoch. Bösester Fall: Zeile öffnen (= gelesen), auswählen, „als
              // ungelesen", Modus endet — und die Zeile steht wieder offen da, obwohl sie gerade
              // auf ungelesen gesetzt wurde. „Aufklappen IST das Lesen" gilt dann nicht mehr.
              onClick={() => {
                setOpenId(null);
                setSelected((prev) => (prev === null ? new Set() : null));
              }}
            >
              {selected !== null ? tc("cancel") : t("select")}
            </Button>
          )}
          {unreadInFilter > 0 && selected === null && (
            <Button variant="secondary" size="sm" icon={<CheckCheck size={16} />} onClick={() => setConfirmAll(true)}>
              {t("markAllRead")}
            </Button>
          )}
        </div>
      )}

      {empty ? (
        <Card>
          <EmptyState
            icon={<Inbox size={40} />}
            title={filtered ? t("emptyFilteredTitle") : t("emptyTitle")}
            description={filtered ? t("emptyFilteredText") : t("emptyText")}
            // Der Satz forderte zum Zurücksetzen auf, ohne einen Weg dorthin anzubieten — die
            // Filterleiste steht zwar darüber, aber zwei Auswahlfelder zurückzustellen ist mehr
            // Arbeit als ein Knopf.
            action={filtered ? { label: t("resetFilter"), onClick: () => applyFilter({}) } : undefined}
          />
        </Card>
      ) : (
      <div ref={listRef} className="scroll-mt-20">
      <Card padding="none">
        {selected !== null && (
          // Die Aktionsleiste steht ÜBER der Liste, nicht darunter: sie gehört zur Auswahl, und wer
          // in einer langen Liste ankreuzt, soll nicht ans Ende scrollen müssen, um sie zu finden.
          // Kein `flex-1`-Platzhalter zwischen Zählung und Knöpfen: auf 390 px schob er den ersten
          // Knopf an den rechten Rand und riss ein Loch in die erste Zeile.
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border-subtle bg-surface-raised">
            {/* Die Beschriftung nennt die GRENZE: `load` leert die Auswahl bei jedem Seiten- und
                Filterwechsel, ein blosses „Alle" verspräche also den ganzen Posteingang. */}
            <Checkbox
              label={t("selectPage")}
              checked={allOnPageSelected}
              disabled={saving || messages.length === 0}
              onChange={() => setSelected(allOnPageSelected ? new Set() : new Set(messages.map((m) => m.id)))}
            />
            <span className="text-xs font-medium text-foreground-muted tabular-nums">
              {t("selectedCount", { count: selected.size })}
            </span>
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
                keyholderName={keyholderName}
                dl={dl}
                tz={tz}
              />
            </li>
          ))}
        </ul>

        <ListPager page={page} totalPages={pageCount} onPage={load} disabled={saving} />
      </Card>
      </div>
      )}

      {/* Rückfrage, weil „gelesen" hier eine Behauptung ist: zwölf Nachrichten stumm zu quittieren
          erzeugte eine, die hinterher niemand halten kann. */}
      <ConfirmDialog
        open={confirmAll}
        title={t("markAllRead")}
        message={t("markAllConfirm", { count: unreadInFilter })}
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
