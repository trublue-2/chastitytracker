import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import CategoryLinkRow from "@/app/components/CategoryLinkRow";
import DashboardBlock from "@/app/components/DashboardBlock";
import { deviceFormHref } from "@/lib/categoryConstants";

export interface IncompleteCategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string;
}

/**
 * Kategorien, in denen es noch kein Gerät gibt — und in denen sich damit nichts erfassen lässt.
 *
 * Sie stehen SICHTBAR im Dashboard statt im eingeklappten Abschnitt „Nicht getragen": eine frische
 * Kategorie ohne Gerät ist kein Zustand, sondern ein halber Schritt, und genau dort hörten zwei
 * Instanzen wochenlang auf (Issue #49). Im grauen Abschnitt sah man ihr nicht an, dass etwas fehlt —
 * sie stand dort wie jede bespielbare Kategorie.
 *
 * Der Link führt direkt ins Geräte-Formular mit dieser Kategorie vorgewählt, nicht auf die
 * Geräte-Seite: „such dir den richtigen Knopf" ist genau die Reibung, an der es scheitert.
 */
export default async function IncompleteCategories({ categories }: { categories: IncompleteCategoryRow[] }) {
  if (categories.length === 0) return null;
  // Namensraum `categories`, nicht `dashboard`: derselbe Satz steht auf der Kategorie-Seite, und
  // zwei Kopien laufen bei der nächsten Umformulierung auseinander. Das Handlungswort kommt aus
  // `wearForm` — dort steht es schon für denselben Leer-Zustand („keine Devices in dieser
  // Kategorie"), und eine dritte Fassung von „Device anlegen" braucht niemand.
  const [t, tWear] = await Promise.all([getTranslations("categories"), getTranslations("wearForm")]);

  return (
    <DashboardBlock>
      <ul className="flex flex-col gap-2">
        {categories.map((c) => (
          <li key={c.id}>
            <CategoryLinkRow
              href={deviceFormHref(c.id)}
              color={c.color}
              icon={c.icon}
              name={c.name}
              subtitle={t("noDevice")}
              subtitleTone="warn"
              actionIcon={<Plus size={12} />}
              actionLabel={tWear("addDeviceLink")}
            />
          </li>
        ))}
      </ul>
    </DashboardBlock>
  );
}
