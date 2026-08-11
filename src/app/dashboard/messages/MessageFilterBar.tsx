"use client";

import { useTranslations } from "next-intl";
import SegmentedControl from "@/app/components/SegmentedControl";
import Select from "@/app/components/Select";
import { MESSAGE_CATEGORY_LIST, MESSAGE_CATEGORY_PILLS } from "@/lib/messageCategories";
import { MESSAGE_SENDER_KINDS, type MessageFilter } from "@/lib/messageService";

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
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <SegmentedControl
        options={[
          { value: "all", label: t("filterAll") },
          { value: "unread", label: t("filterUnread") },
        ]}
        value={filter.unreadOnly ? "unread" : "all"}
        onChange={(v) => onChange({ ...filter, unreadOnly: v === "unread" })}
      />

      <Select
        aria-label={t("filterCategoryLabel")}
        disabled={disabled}
        value={filter.category ?? ANY}
        options={[
          { value: ANY, label: t("filterAllCategories") },
          ...MESSAGE_CATEGORY_LIST.map((c) => ({ value: c, label: t(MESSAGE_CATEGORY_PILLS[c].labelKey) })),
        ]}
        onChange={(e) =>
          onChange({
            ...filter,
            category: e.target.value === ANY ? undefined : (e.target.value as NonNullable<MessageFilter["category"]>),
          })
        }
      />

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
  );
}
