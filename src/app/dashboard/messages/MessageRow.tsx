"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Bot, Check, Settings, Trash2, Undo2, UserRound } from "lucide-react";
import Badge from "@/app/components/Badge";
import Checkbox from "@/app/components/Checkbox";
import DetailField from "@/app/components/DetailField";
import ExpandRow from "@/app/components/ExpandRow";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import useIsClamped from "@/app/hooks/useIsClamped";
import { formatDayMonth, formatTime } from "@/lib/utils";
import { MESSAGE_CATEGORY_PILLS } from "@/lib/messageCategories";
import type { PresentedMessage } from "@/lib/messagePresenter";
import type { MessageSenderKind } from "@/lib/messageService";

const SENDER_ICON: Record<MessageSenderKind, typeof Bot> = { ai: Bot, keyholder: UserRound, system: Settings };

/**
 * Eine Zeile des Posteingangs.
 *
 * Aus der Liste herausgelöst, weil sie mit der Auswahl einen zweiten Zustand bekam und die Liste
 * sonst drei Anliegen in einer Datei trüge (Laden/Blättern, Auswahl, Darstellung).
 *
 * AUFKLAPPBAR NUR MIT INHALT: Bis v5.0.12 klappte jede Zeile auf — auch die, deren ganzer Inhalt
 * schon in der Vorschau stand. Sie wurde dann bloss höher, und das Panel darunter blieb leer. Ein
 * Aufklapp-Knopf ist ein Versprechen; hier hat er es gebrochen. Ob der Text tatsächlich abgeschnitten
 * ist, lässt sich nicht raten (Schriftgrösse, Spaltenbreite, Sprache) — `useIsClamped` misst es am
 * gerenderten Element.
 */
export default function MessageRow({
  message: m,
  open,
  selecting,
  checked,
  onCheck,
  onToggle,
  onMarkRead,
  onMarkUnread,
  onDelete,
  dl,
  tz,
}: {
  message: PresentedMessage;
  open: boolean;
  selecting: boolean;
  checked: boolean;
  onCheck: () => void;
  onToggle: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
  /** Datums-Locale (`toDateLocale`). */
  dl: string;
  tz: string;
}) {
  const t = useTranslations("messages");
  const tc = useTranslations("common");

  const Icon = SENDER_ICON[m.senderKind];
  const cat = MESSAGE_CATEGORY_PILLS[m.category];
  // Ein Bezug (Text oder Fehl-Hinweis) ist optional — viele Nachrichten haben bewusst keinen
  // (siehe orgasmusAnforderungService: Rückzug ohne refId).
  const hasRef = Boolean(m.refText) || m.refMissing;
  // Gemessen wird nur im ZUGEKLAPPTEN Zustand — offen ist der Text nicht mehr beschnitten, die
  // Messung ergäbe „passt", und die Zeile verlöre ihren Knopf unter dem Finger. Der Hook hält den
  // letzten Messwert, solange nicht gemessen wird; ein `|| open` als Ausgleich braucht es nicht.
  const [textRef, textClamped] = useIsClamped(!open);
  const expandable = hasRef || Boolean(m.refHref) || textClamped;

  const title = (
    <span className="flex items-start gap-2">
      {/* Ungelesen dreifach codiert: Punkt, Fettschrift, Text für Screenreader.
          Farbe allein ist in vier Themes und für Farbfehlsichtige keine Information. */}
      <span
        className={`mt-2 w-2 h-2 rounded-full shrink-0 ${m.read ? "bg-transparent" : "bg-warn"}`}
        aria-hidden="true"
      />
      {/* text-base: der Meldungstext ist die Überschrift der Zeile und muss sich von der
          text-xs-Metazeile und dem text-sm-Bezug deutlich abheben. */}
      <span className={`min-w-0 text-base ${m.read ? "font-medium" : "font-semibold"}`}>
        {!m.read && <span className="sr-only">{t("unread")} — </span>}
        {/* Zu ist die Zeile eine Vorschau, offen der ganze Text — der Text steht deshalb GENAU
            EINMAL da und wird im Panel nicht wiederholt. line-clamp statt truncate: ein „…" mitten
            im Straftext schnitte genau die Begründung ab, wegen der es den Posteingang gibt. */}
        <span ref={textRef} className={open ? "whitespace-pre-wrap" : "line-clamp-2"}>{m.text}</span>
      </span>
    </span>
  );

  const meta = (
    // pl-4 = Punkt + gap: die Metazeile hängt unter dem Titel, nicht unter dem Punkt.
    // flex-wrap, weil Kategorie + Absender + Datum auf 390 px sonst überlaufen.
    <span className="flex items-center flex-wrap gap-x-1.5 gap-y-1 pl-4">
      <Badge size="sm" label={t(cat.labelKey)} variant={cat.variant} />
      {/* Icon, Absender und Zeit als EINE Einheit: bricht die Zeile, fällt der Umbruch zwischen
          Kategorie und Absender — nie zwischen Icon und Name. Die Absender-Angabe bleibt neben der
          Kategorie stehen: dass die KI geurteilt hat, ist eine Zusicherung und wird nicht durch das
          Thema ersetzt. */}
      <span className="inline-flex items-center gap-1.5">
        <Icon size={12} aria-hidden="true" />
        {t(`sender.${m.senderKind}`)} · {formatDayMonth(m.createdAt, dl, tz)} {formatTime(m.createdAt, dl, tz)}
      </span>
    </span>
  );

  // „Als gelesen" gehört ins Menü, seit nicht mehr jede Zeile aufklappbar ist: das Aufklappen WAR
  // die Lese-Geste („Aufklappen IST das Lesen"), und eine kurze Nachricht ohne Bezug hat keine
  // Aufklapp-Fläche mehr. Ohne diesen Eintrag bliebe sie dauerhaft ungelesen und die Glocke zählte
  // sie ewig mit — wegzubekommen nur pauschal über „Alle als gelesen".
  const actions = (
    <RowActionsMenu
      items={[
        m.read
          ? { label: t("markUnread"), icon: <Undo2 size={14} className="text-foreground-faint" />, onSelect: onMarkUnread }
          : { label: t("markRead"), icon: <Check size={14} className="text-foreground-faint" />, onSelect: onMarkRead },
        { label: tc("delete"), icon: <Trash2 size={14} />, onSelect: onDelete, danger: true },
      ]}
    />
  );

  const row = (
    <ExpandRow
      open={open}
      // Kein `onToggle` = kein Aufklappen: `ExpandRow` lässt Knopf, Chevron und Panel weg und
      // behält Geometrie und Aktions-Spalte. Ein Aufklapp-Knopf ist ein Versprechen — hier gäbe es
      // nichts einzulösen.
      onToggle={expandable ? onToggle : undefined}
      actions={selecting ? undefined : actions}
      label={title}
      subtitle={meta}
    >
      {/* Ohne Trennlinie: der Abstand setzt das Aufgeklappte ab. Der Inhalt beginnt bei pl-4 auf der
          Titelkante — nie links davon. */}
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
        {/* Verlinkt wird nur, wo eine Seite etwas beiträgt — heute die offene Kontrolle mit
            vorbelegtem Code. Der Link steht IM Panel, nicht im Titel: dessen Aufklapp-Fläche ist ein
            `button`, ein `a` darin wäre ungültiges Markup und würde den Klick verschlucken. */}
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
  );

  if (!selecting) return row;

  return (
    <div className="flex items-start">
      <div className="pl-4 pt-2">
        {/* Die Beschriftung wandert zum Screenreader: sichtbar steht der Meldungstext daneben, und
            eine zweite Beschriftung im Kreuzchen wiederholte ihn nur. */}
        <Checkbox label={t("selectRow")} labelHidden checked={checked} onChange={onCheck} />
      </div>
      <div className="min-w-0 flex-1">{row}</div>
    </div>
  );
}
