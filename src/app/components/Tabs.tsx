"use client";

import { useRef, useCallback, type KeyboardEvent } from "react";

interface Tab {
  key: string;
  label: string;
  disabled?: boolean;
}

/** `segmented` = volle Breite, gefüllter Aktiv-Zustand, umrandeter Block — die Optik der
 *  Formular-Umschalter („Dauer / Zeitpunkt"). Über `FieldTabs` genutzt. */
type TabsVariant = "underline" | "pills" | "segmented";

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (key: string) => void;
  variant?: TabsVariant;
  className?: string;
  /** Bindet eine externe Beschriftung an die Gruppe (siehe `FieldTabs`). */
  "aria-labelledby"?: string;
}

export default function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = "underline",
  className = "",
  "aria-labelledby": ariaLabelledBy,
}: TabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const enabledTabs = tabs.filter((t) => !t.disabled);
      const currentIndex = enabledTabs.findIndex((t) => t.key === activeTab);
      let nextIndex = currentIndex;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % enabledTabs.length;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
      } else if (e.key === "Home") {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        nextIndex = enabledTabs.length - 1;
      } else {
        return;
      }

      const nextTab = enabledTabs[nextIndex];
      onChange(nextTab.key);

      // Focus the new tab button
      const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      const targetButton = Array.from(buttons ?? []).find(
        (btn) => btn.dataset.tabKey === nextTab.key
      );
      targetButton?.focus();
    },
    [tabs, activeTab, onChange],
  );

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-labelledby={ariaLabelledBy}
      className={[
        "flex overflow-x-auto scrollbar-none",
        variant === "underline" ? "border-b border-border gap-0"
          : variant === "segmented" ? "bg-surface-raised border border-border rounded-xl overflow-hidden"
          : "gap-1 p-1 bg-background-subtle rounded-lg",
        className,
      ].join(" ")}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            data-tab-key={tab.key}
            aria-selected={isActive}
            aria-disabled={tab.disabled}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.key)}
            className={[
              variant === "segmented" ? "flex-1 min-w-0" : "shrink-0",
              "text-sm font-medium whitespace-nowrap transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus-ring",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              variant === "underline"
                ? [
                    "px-4 py-2.5 -mb-px border-b-2",
                    isActive
                      ? "border-btn-primary text-foreground"
                      : "border-transparent text-foreground-muted hover:text-foreground hover:border-border-strong",
                  ].join(" ")
                : variant === "segmented"
                ? [
                    // min-h-12 wie Button/Checkbox/Toggle — die vorherige lokale Fassung lag bei ~36 px
                    // und damit unter der Mindest-Trefferfläche des Hauses.
                    "min-h-12 px-3 text-center truncate",
                    isActive
                      ? "bg-foreground text-background font-semibold"
                      : "text-foreground-muted hover:bg-border-subtle",
                  ].join(" ")
                : [
                    "px-3 py-1.5 rounded-md",
                    isActive
                      ? "bg-surface text-foreground shadow-card"
                      : "text-foreground-muted hover:text-foreground",
                  ].join(" "),
            ].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
      {/* Fade gradient for scroll hint on mobile */}
      {variant === "underline" && tabs.length > 4 && (
        <div className="sticky right-0 w-8 shrink-0 bg-gradient-to-l from-background to-transparent pointer-events-none sm:hidden" aria-hidden="true" />
      )}
    </div>
  );
}
