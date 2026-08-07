"use client";

import { Lock, Check } from "lucide-react";
import CategoryIconRender from "@/app/components/CategoryIcon";
import Select from "@/app/components/Select";
import { categoryStyle } from "@/lib/categoryConstants";
import type { TaskRequirementInput } from "@/lib/taskService";

export interface PickerCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  devices: { id: string; name: string }[];
}

/**
 * Bedingungen einer Aufgabe zusammenstellen — „KG verschlossen" plus je eine Zeile pro Trage-Kategorie.
 *
 * Bewusst eine ANTIPP-Liste statt Zeilen aus zwei Dropdowns: auf 375 px bleiben nach den Rändern
 * ~300 px, zwei Selects nebeneinander sind dort unlesbar, und ein zweispaltiges Feld-Layout gibt es
 * sonst nirgends in dieser App. Die Zeile IST der Typ — damit entfallen das Art-Dropdown und der
 * Entfernen-Knopf, und fürs Leitbeispiel (KG + Halsband + Knebel) braucht es drei Taps statt neun.
 * Muster übernommen von den Kategorie-Zeilen in `aktionen/page.tsx`.
 */
export default function TaskRequirementPicker({
  label,
  hint,
  kgLabel,
  anyDeviceLabel,
  deviceLabel,
  categories,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  kgLabel: string;
  anyDeviceLabel: string;
  deviceLabel: string;
  categories: PickerCategory[];
  value: TaskRequirementInput[];
  onChange: (next: TaskRequirementInput[]) => void;
}) {
  const kgSelected = value.some((r) => r.type === "KG_LOCKED");
  const selectedCategory = (id: string) => value.find((r) => r.type === "WEAR" && r.categoryId === id);

  const toggleKg = () => {
    onChange(kgSelected ? value.filter((r) => r.type !== "KG_LOCKED") : [...value, { type: "KG_LOCKED" }]);
  };

  const toggleCategory = (id: string) => {
    onChange(
      selectedCategory(id)
        ? value.filter((r) => !(r.type === "WEAR" && r.categoryId === id))
        : [...value, { type: "WEAR", categoryId: id }],
    );
  };

  const setDevice = (categoryId: string, deviceId: string) => {
    onChange(value.map((r) =>
      r.type === "WEAR" && r.categoryId === categoryId ? { ...r, deviceId: deviceId || null } : r,
    ));
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-foreground-faint">{label}</span>
      <div className="rounded-xl border border-border divide-y divide-border-subtle overflow-hidden">
        <Row
          selected={kgSelected}
          onToggle={toggleKg}
          name={kgLabel}
          icon={<Lock className="size-5" />}
          iconStyle={{ backgroundColor: "var(--color-lock-bg)", color: "var(--color-lock)" }}
        />
        {categories.map((c) => {
          const req = selectedCategory(c.id);
          const style = categoryStyle(c.color);
          return (
            <div key={c.id}>
              <Row
                selected={!!req}
                onToggle={() => toggleCategory(c.id)}
                name={c.name}
                icon={<CategoryIconRender name={c.icon} className="size-5" />}
                iconStyle={{ backgroundColor: style.backgroundColor, color: style.color }}
              />
              {req && c.devices.length > 0 && (
                // Volle Breite in eigener Zeile — nie neben der Kategorie, siehe Kommentar oben.
                <div className="px-4 pb-3 pt-1">
                  <Select
                    label={deviceLabel}
                    options={[
                      { value: "", label: anyDeviceLabel },
                      ...c.devices.map((d) => ({ value: d.id, label: d.name })),
                    ]}
                    value={req.deviceId ?? ""}
                    onChange={(e) => setDevice(c.id, e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <span className="text-xs text-foreground-faint">{hint}</span>
    </div>
  );
}

/** Eine antippbare Bedingungs-Zeile. Echter `button` mit `aria-pressed` — ein `div` mit onClick wäre
 *  für Tastatur und Screenreader kein Schalter. */
function Row({
  selected, onToggle, name, icon, iconStyle,
}: {
  selected: boolean;
  onToggle: () => void;
  name: string;
  icon: React.ReactNode;
  iconStyle: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`w-full min-h-12 flex items-center gap-3 px-4 py-3 text-left transition ${
        selected ? "bg-ok-bg" : "hover:bg-surface-raised"
      }`}
    >
      <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={iconStyle}>
        {icon}
      </span>
      <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{name}</span>
      <span
        className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
          selected ? "bg-ok border-ok text-background" : "border-border"
        }`}
        aria-hidden
      >
        {selected && <Check size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}
