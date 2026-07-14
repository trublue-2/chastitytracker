"use client";

import { useState, type ReactNode } from "react";
import Card from "./Card";
import CategoryIconRender from "./CategoryIcon";
import { categoryStyle } from "@/lib/categoryConstants";

/** Das Minimum, das eine Variante zum Umschalten braucht. Kalender- und Device-Nutzungs-Varianten
 *  erweitern das um ihren Inhalt. */
export interface CategoryVariant {
  id: string;
  name: string;
  color: string;
  icon: string;
}

/** Card mit Kategorie-Umschalter (KG + Geräte-Kategorien) — geteilt von Tragekalender und
 *  Device-Nutzung. Die Card besitzt die Auswahl; der Aufrufer rendert nur den Körper zur aktiven
 *  Variante. Der Pillen-Streifen bleibt verborgen, solange es nur eine Variante gibt: wer nur KG
 *  trackt, hat nichts umzuschalten.
 *
 *  `variants` muss mindestens eine Variante enthalten — leere Listen filtert der Aufrufer weg,
 *  sonst gäbe es nichts anzuzeigen. */
export default function CategorySwitcherCard<T extends CategoryVariant>({ title, variants, header, children }: {
  title: string;
  variants: T[];
  /** Optionaler Zusatz im Kopf (z.B. die Kalender-Legende), abhängig von der aktiven Variante. */
  header?: (active: T) => ReactNode;
  children: (active: T) => ReactNode;
}) {
  const [activeId, setActiveId] = useState(variants[0].id);
  const active = variants.find((v) => v.id === activeId) ?? variants[0];

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle flex flex-col gap-3">
        <p className="text-sm font-bold text-foreground">{title}</p>

        {variants.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label={title}>
            {variants.map((v) => {
              const isActive = v.id === active.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveId(v.id)}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-sm font-medium transition active:scale-95 ${
                    isActive
                      ? "border shadow-card"
                      : "bg-surface-raised text-foreground-muted border-border hover:bg-background-subtle"
                  }`}
                  style={isActive ? categoryStyle(v.color) : undefined}
                >
                  <CategoryIconRender name={v.icon} className="size-3.5" />
                  {v.name}
                </button>
              );
            })}
          </div>
        )}

        {header?.(active)}
      </div>

      {children(active)}
    </Card>
  );
}
