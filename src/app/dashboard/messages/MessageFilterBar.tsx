"use client";

import { useTranslations } from "next-intl";
import SegmentedControl from "@/app/components/SegmentedControl";
import Select from "@/app/components/Select";
import {
  MESSAGE_CATEGORIES, MESSAGE_CATEGORY_PILLS, MESSAGE_SENDER_KINDS, type MessageFilter,
} from "@/lib/messageCategories";

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
  disabled,
}: {
  filter: MessageFilter;
  onChange: (filter: MessageFilter) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("messages");

  return (
    /* Kein `flex-wrap`: der Umbruch liess das dritte Feld allein auf einer zweiten Zeile stehen, und
       weil die Felder ihrer Beschriftung nach unterschiedlich breit waren, franste die Leiste aus.
       Stattdessen zwei Gruppen — der Umschalter, und die beiden Auswahlfelder als Paar, das sich den
       Rest teilt. Schmal untereinander, ab `sm` nebeneinander. */
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
      {/* `self-start`: als Flex-Kind einer Spalte zöge sich der Umschalter sonst über die volle
          Breite und stünde mit leerem Raum rechts da. Er ist so breit wie seine zwei Wörter. */}
      <div className="self-start sm:self-auto">
      <SegmentedControl
        size="md"
        disabled={disabled}
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
      <Select
        aria-label={t("filterCategoryLabel")}
        disabled={disabled}
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
      <div className="flex-1 min-w-0">
      <Select
        aria-label={t("filterSenderLabel")}
        disabled={disabled}
        value={filter.senderKind ?? ANY}
        options={[
          { value: ANY, label: t("filterAllSenders") },
          ...MESSAGE_SENDER_KINDS.map((s) => ({ value: s, label: t(`sender.${s}`) })),
        ]}
        onChange={(e) =>
          onChange({
            ...filter,
            senderKind: e.target.value === ANY ? undefined : (e.target.value as NonNullable<MessageFilter["senderKind"]>),
          })
        }
      />
      </div>
      </div>
    </div>
  );
}
