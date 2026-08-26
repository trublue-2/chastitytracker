"use client";

import { useTranslations } from "next-intl";
import SegmentedControl from "@/app/components/SegmentedControl";
import Select from "@/app/components/Select";
import LiveStatus from "@/app/components/LiveStatus";
import {
  MESSAGE_CATEGORIES, MESSAGE_CATEGORY_PILLS, MESSAGE_SENDER_KINDS, senderLabel, type MessageFilter,
} from "@/lib/messageCategories";
import type { MessageScope } from "@/lib/messageScope";

/** Der leere Wert der beiden Auswahlfelder — „egal", nicht „keine". Als Konstante, weil ihn die
 *  Zuordnung in beide Richtungen braucht. */
const ANY = "";

/**
 * Die Filterleiste des Posteingangs: alle/ungelesen, Kategorie, Absender.
 *
 * Der Filter gehört dem Aufrufer — diese Leiste zeigt ihn nur und meldet Änderungen. Sie hält
 * bewusst keinen eigenen Zustand: sonst stünde nach einem Seitenwechsel eine Auswahl da, die die
 * Liste daneben gar nicht anwendet.
 */
export default function MessageFilterBar({
  filter,
  onChange,
  busy,
  announcement,
  scope,
  aiSenderAvailable,
  keyholderName,
}: {
  filter: MessageFilter;
  onChange: (filter: MessageFilter) => void;
  /** Läuft gerade ein Nachladen? Heisst NICHT `disabled`, und die Felder bekommen das Attribut auch
   *  nicht: ein Element, das unter dem Fokus `disabled` wird, kann ihn nicht halten — der Browser
   *  gibt ihn an `<body>`. Wer die Kategorie per Tastatur wechselte, stand danach am Seitenanfang
   *  und musste sich zur Leiste zurücktabben, für jeden Wechsel erneut. Stattdessen bleiben die
   *  Felder bedienbar und die Handler lassen den Wechsel während des Ladens fallen. */
  busy?: boolean;
  /**
   * Was der letzte Filterwechsel gebracht hat, als fertiger Satz samt Zähler — der Rückgabewert von
   * `useAnnouncement()` beim Aufrufer. Er kennt das Ergebnis, diese Leiste kennt nur die Auswahl.
   */
  announcement?: { children: React.ReactNode; seq: number };
  /** WESSEN Posteingang gefiltert wird — entscheidet, ob es die Absender-Achse überhaupt gibt. */
  scope: MessageScope;
  /** Kann auf dieser Instanz überhaupt eine KI schreiben (MCP eingerichtet)? Sonst fehlt der Eintrag
   *  „KI-Keyholder": er fände nie etwas und behauptete eine Fähigkeit, die es hier nicht gibt. */
  aiSenderAvailable: boolean;
  /** Benutzername des EINEN Keyholders, sonst `null`. Ein NAME, kein i18n-Schlüssel — deshalb kommt
   *  er vom Server. Ohne ihn bleibt es bei der allgemeinen Beschriftung. */
  keyholderName: string | null;
}) {
  const t = useTranslations("messages");

  // Im Keyholder-Posteingang gibt es NICHTS zu filtern: dort ist heute jede Zeile `senderKind:
  // "system"` (sie entsteht ausschliesslich aus `notifyControllers`). „Keyholder" und
  // „KI-Keyholder" anzubieten hiesse, auf einen vollen Posteingang eine garantiert leere Liste zu
  // schalten — dieselbe Begründung, aus der der KI-Eintrag beim Träger ohne MCP wegfällt, nur eine
  // Achse höher. Das Feld kommt zurück, sobald es von Keyholderin oder KI VERFASSTE Nachrichten gibt
  // (Etappe 3); dann steht hier eine Bedingung statt eines Riegels.
  const showSender = scope !== "keyholder";

  const senderKinds = MESSAGE_SENDER_KINDS.filter(
    // Der gerade WIRKSAME Wert bleibt immer wählbar, auch wenn er sonst wegfiele: ein bestehender
    // Link `?sender=ai` filtert die Liste daneben weiterhin, und ein Auswahlfeld ohne passenden
    // Eintrag zeigte etwas anderes an als das, was gilt.
    (s) => s !== "ai" || aiSenderAvailable || filter.senderKind === "ai",
  );

  return (
    /* Kein `flex-wrap`: der Umbruch liess das dritte Feld allein auf einer zweiten Zeile stehen, und
       weil die Felder ihrer Beschriftung nach unterschiedlich breit waren, franste die Leiste aus.
       Stattdessen zwei Gruppen — der Umschalter, und die beiden Auswahlfelder als Paar, das sich den
       Rest teilt. Schmal untereinander, ab `sm` nebeneinander. */
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3" aria-busy={busy}>
      <LiveStatus {...announcement} />

      {/* `self-start`: als Flex-Kind einer Spalte zöge sich der Umschalter sonst über die volle
          Breite und stünde mit leerem Raum rechts da. Er ist so breit wie seine zwei Wörter. */}
      <div className="self-start sm:self-auto">
      <SegmentedControl
        size="md"
        options={[
          { value: "all", label: t("filterAll") },
          { value: "unread", label: t("filterUnread") },
        ]}
        value={filter.unreadOnly ? "unread" : "all"}
        onChange={(v) => onChange({ ...filter, unreadOnly: v === "unread" })}
      />
      </div>

      <div className="flex gap-2 flex-1 min-w-0">
      <div className="flex-1 min-w-0">
      {/* Die Felder bleiben während eines Ladevorgangs BEDIENBAR.
          
          Sie waren erst gesperrt, und das war in beide Richtungen falsch: ein `<select>` lässt sich
          mit `aria-disabled` gar nicht sperren, also verwarf der Handler die Änderung — React stellte
          den alten Wert wieder her, und die Auswahl sprang dem Nutzer kommentarlos zurück. Seit
          `MessageList.loadLatest` einen Wechsel während eines laufenden Abrufs NACHSTELLT statt ihn
          zu verwerfen, gibt es nichts mehr zu sperren. Dass gerade geladen wird, sagt das `aria-busy`
          der Leiste. */}
      <Select
        aria-label={t("filterCategoryLabel")}
        value={filter.category ?? ANY}
        options={[
          { value: ANY, label: t("filterAllCategories") },
          ...MESSAGE_CATEGORIES.map((c) => ({ value: c, label: t(MESSAGE_CATEGORY_PILLS[c].labelKey) })),
        ]}
        onChange={(e) =>
          onChange({
            ...filter,
            category: e.target.value === ANY ? undefined : (e.target.value as NonNullable<MessageFilter["category"]>),
          })
        }
      />

      </div>
      {showSender && (
      <div className="flex-1 min-w-0">
      <Select
        aria-label={t("filterSenderLabel")}
        value={filter.senderKind ?? ANY}
        options={[
          { value: ANY, label: t("filterAllSenders") },
          // Ohne eigenen Absender-Namen: die Auswahl meint eine ART, keine einzelne Nachricht — es
          // gibt hier nichts, was sie fragen könnte. Sie bleibt damit beim Seiten-Namen, die Zeilen
          // darunter dürfen genauer sein.
          ...senderKinds.map((s) => ({ value: s, label: senderLabel(s, null, keyholderName, t) })),
        ]}
        onChange={(e) =>
          onChange({
            ...filter,
            senderKind: e.target.value === ANY ? undefined : (e.target.value as NonNullable<MessageFilter["senderKind"]>),
          })
        }
      />
      </div>
      )}
      </div>
    </div>
  );
}
