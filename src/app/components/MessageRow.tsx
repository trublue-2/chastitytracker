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
import { MESSAGE_CATEGORY_PILLS, senderLabel } from "@/lib/messageCategories";
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
  keyholderName,
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
  /** Benutzername des EINEN Keyholders, sonst `null` — kommt vom Server durch die Liste. */
  keyholderName: string | null;
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
  // Im Auswahlmodus ruht das Aufklappen (siehe unten), also zeigt die Zeile dort auch wieder die
  // Vorschau — sonst stünde ein Eintrag, der beim Moduswechsel gerade offen war, mit vollem Text
  // und ohne Panel zwischen lauter kurzen Zeilen und wäre ohne sichtbaren Grund doppelt so hoch.
  // Eine Auswahlliste lebt davon, dass ihre Zeilen gleich hoch sind.
  const expanded = open && !selecting;
  // Gemessen wird nur im ZUGEKLAPPTEN Zustand — offen ist der Text nicht mehr beschnitten, die
  // Messung ergäbe „passt", und die Zeile verlöre ihren Knopf unter dem Finger. Der Hook hält den
  // letzten Messwert, solange nicht gemessen wird; ein `|| open` als Ausgleich braucht es nicht.
  const [textRef, textClamped] = useIsClamped(!expanded);
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
        <span ref={textRef} className={expanded ? "whitespace-pre-wrap" : "line-clamp-2"}>{m.text}</span>
      </span>
    </span>
  );

  const meta = (
    // pl-4 = Punkt + gap: die Metazeile hängt unter dem Titel, nicht unter dem Punkt.
    // flex-wrap, weil Kategorie + Absender + Datum auf 390 px sonst überlaufen.
    <span className="flex items-center flex-wrap gap-x-1.5 gap-y-1 pl-4">
      <Badge size="sm" label={t(cat.labelKey)} variant={cat.variant} />
      {/* UM WEN es geht — nur im Keyholder-Posteingang gesetzt (dort spannt die Liste über mehrere
          Träger, und eine Zeile ohne Namen sagt nicht, wen sie meint). Im Posteingang des Trägers
          bleibt das Feld leer und die Zeile sieht aus wie bisher. Leise gesetzt: die Zeile beantwortet
          weiterhin zuerst WAS passiert ist, der Name ist die Einordnung daneben. */}
      {m.subjectUsername && (
        <span className="font-medium text-foreground-muted">{t("subjectLabel", { name: m.subjectUsername })}</span>
      )}
      {/* Icon, Absender und Zeit als EINE Einheit: bricht die Zeile, fällt der Umbruch zwischen
          Kategorie und Absender — nie zwischen Icon und Name. Die Absender-Angabe bleibt neben der
          Kategorie stehen: dass die KI geurteilt hat, ist eine Zusicherung und wird nicht durch das
          Thema ersetzt. Beim menschlichen Keyholder ist sein NAME die genauere Zusicherung — die
          Regel dafür teilt sich die Zeile mit der Filterleiste (`senderLabel`), sonst sagte die
          Auswahl oben den Namen und die Zeile darunter weiter „Keyholder". Trägt die Nachricht ihren
          eigenen Absender (`senderName`), gilt der — er weiss, wer geschrieben hat, während der
          Seiten-Name nur rät. */}
      <span className="inline-flex items-center gap-1.5">
        <Icon size={12} aria-hidden="true" />
        {senderLabel(m.senderKind, m.senderName, keyholderName, t)} · {formatDayMonth(m.createdAt, dl, tz)} {formatTime(m.createdAt, dl, tz)}
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
      open={expanded}
      // Kein `onToggle` = kein Aufklappen: `ExpandRow` lässt Knopf, Chevron und Panel weg und
      // behält Geometrie und Aktions-Spalte. Ein Aufklapp-Knopf ist ein Versprechen — hier gäbe es
      // nichts einzulösen.
      //
      // Im AUSWAHLMODUS gilt dasselbe für JEDE Zeile: dort ist die ganze Zeile das Kästchen (siehe
      // unten), das Aufklappen ruht. Damit verschwindet auch das Chevron, das sonst ein Aufklappen
      // verspräche, das der Klick nicht mehr einlöst. Und ein Eintrag, der beim Wechsel in den
      // Modus schon offen war, klappt von selbst zu — ohne `onToggle` rendert `ExpandRow` kein
      // Panel. Das ist die gewünschte Auflösung von `selecting && open`: das offene Panel trägt
      // einen Link, und ein Link in einer Zeile, die als Ganzes umschaltet, wäre eine zweite
      // Bedeutung für denselben Griff.
      onToggle={!selecting && expandable ? onToggle : undefined}
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

  /* IM AUSWAHLMODUS IST DIE GANZE ZEILE DAS KÄSTCHEN.
   *
   * Vorher war nur das Kästchen selbst die Trefferfläche — 20 px breit in einer 358 px breiten
   * Zeile. Jeder Fehlgriff landete auf der Aufklapp-Fläche, und Aufklappen IST das Lesen. „Gelesen"
   * ist bei einer Nachricht mit Frist keine Anzeige, sondern eine Behauptung mit Folgen, die die
   * Keyholderin sieht. Zurücknehmen ginge nur über das ⋮-Menü der Zeile — und genau das blendet
   * dieser Modus aus (`actions={selecting ? undefined : actions}`). Man müsste also den Modus
   * verlassen, um den Unfall zu reparieren, den der Modus verursacht hat. Deshalb darf er ihn gar
   * nicht erst verursachen: ein Klick in die Zeile wählt aus, sonst nichts. So macht es jede
   * Mail-App.
   *
   * `role="checkbox"` auf einem `div` statt eines zweiten Knopfes oder eines umschliessenden
   * `label`: der Zeileninhalt bringt einen Absatz mit (`ExpandRow` setzt die Metazeile als `<p>`),
   * und `<p>` in `<button>`/`<label>` ist ungültiges Markup. Das `div` hat diese Einschränkung
   * nicht und ist mit Rolle, `aria-checked`, `tabIndex` und Leertaste ein vollwertiger Umschalter.
   * Sein Name entsteht aus dem Inhalt — der Screenreader sagt also die Meldung selbst an, nicht ein
   * farbloses „Nachricht auswählen". Fokussierbare Nachfahren hat er keine: ohne `onToggle` und
   * ohne `actions` besteht die Zeile nur noch aus Text.
   */
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={onCheck}
      // Leertaste, nicht Enter: das ist die Taste, die die angesagte Rolle verspricht — ein natives
      // Kontrollkästchen tut auf Enter ebenfalls nichts. `preventDefault` hält die Seite darunter
      // an, die sonst beim Umschalten wegscrollte.
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          onCheck();
        }
      }}
      className="flex items-start cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      {/* Das Kästchen ist hier nur noch ANZEIGE. `pointer-events-none`, weil ein Treffer darauf
          sonst zweimal zählte — Zeile schaltet um, Kästchen schaltet um, Ergebnis: nichts passiert.
          `aria-hidden` samt `tabIndex={-1}`, damit für dieselbe Zeile nicht zwei Kontrollkästchen
          angesagt und angesteuert werden; umgeschaltet wird ausschliesslich über die Zeile.
          `readOnly` nur, damit React ein gesteuertes Feld ohne `onChange` nicht anmahnt. */}
      <div className="pl-4 pt-2 pointer-events-none" aria-hidden="true">
        <Checkbox label={t("selectRow")} labelHidden checked={checked} readOnly tabIndex={-1} />
      </div>
      <div className="min-w-0 flex-1">{row}</div>
    </div>
  );
}
