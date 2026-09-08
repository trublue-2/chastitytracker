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
  /** Name der Gruppe, wo es keine sichtbare Beschriftung gibt, an die man binden könnte — der
   *  Einheiten-Umschalter unter einem Umschalter der Antwort-Art (siehe `FieldTabs`). Eine
   *  `tablist` ohne Namen wird als Gruppe ohne Zugehörigkeit vorgelesen. */
  "aria-label"?: string;
}

export default function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = "underline",
  className = "",
  "aria-labelledby": ariaLabelledBy,
  "aria-label": ariaLabel,
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
      aria-label={ariaLabel}
      className={[
        "flex overflow-x-auto scrollbar-none",
        variant === "underline" ? "border-b border-border gap-0"
          : variant === "segmented" ? "gap-1 p-1 bg-surface-raised border border-border rounded-xl"
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
              variant === "segmented" ? "flex-1 sm:flex-none min-w-0" : "shrink-0",
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
                    // Eine abgehobene Pille statt eines voll invertierten Blocks: der frühere
                    // fast-weisse Balken mit fetter Schrift war optisch zu schwer, eine bloss dezent
                    // hellere Fläche mit `shadow-card` dagegen unsichtbar — in den dunklen Welten ist
                    // `--shadow-card: none`, und `surface`/`surface-raised` liegen zu nah beieinander.
                    // Darum `border-strong` als klar erkennbare, aber neutrale (nicht grelle) Füllung
                    // mit vollem Text-Kontrast; inaktiv nur gedämpfter Text ohne Fläche. Das `p-1` am
                    // Container setzt die Pille ein; die Trefferfläche bleibt mit min-h-10 + Rand bei
                    // rund 48 px (Mindest-Trefferfläche des Hauses).
                    "min-h-10 px-3 rounded-lg text-center truncate",
                    isActive
                      ? "bg-border-strong text-foreground font-semibold shadow-raised"
                      : "text-foreground-muted hover:text-foreground",
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
