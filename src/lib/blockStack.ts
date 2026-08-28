import type { ReactNode } from "react";
import type { BlockIdOf, BlockSurface } from "@/lib/dashboardBlockRegistry";
import type { ResolvedLayout } from "@/lib/dashboardLayout";

/**
 * **Ein Block, der seine Daten selbst beschafft** — und die Maschinerie, die daraus einen Stapel
 * macht.
 *
 * Das ist der Kern von Etappe B. Bis hierher lud die Seite alles, was IRGENDEIN Block brauchen
 * könnte, und reichte es an die Blöcke durch; ein ausgeblendeter Block sparte damit die
 * Übertragung, nicht die Abfrage. Jetzt hängt die Beschaffung am Block, und {@link renderStack}
 * ruft nur die der SICHTBAREN.
 *
 * Die Zusage steht bewusst an EINER Stelle und nicht in jeder der drei Seiten: „nur die sichtbaren
 * laden" ist eine Eigenschaft dieser Funktion, keine Gewohnheit ihrer Aufrufer.
 */

/**
 * Ein Block ist eine Funktion vom Seiten-Kontext auf seinen Knoten. Mehr braucht es nicht: ein
 * Block, der nichts lädt, ist einfach eine Funktion ohne `await`.
 */
/**
 * Was `renderStack` JE BLOCK dazugibt — der Teil des Kontexts, den nur der Stapel kennen kann.
 *
 * Bis hierher schrieb jeder Block seine eigene Id ein zweites Mal hin
 * (`layout.collapseDefault("sessionList")`), direkt neben seinen eigenen Tabellen-Schlüssel. Sieben
 * Literale, jedes davon typkorrekt auch dann, wenn es die Id des NACHBARN trägt — ein kopierter
 * Eintrag las still dessen Einstellung. Der Stapel kennt die Id an der Stelle, an der er den Block
 * aufruft; von dort kommt sie jetzt.
 */
export interface BlockRenderExtras {
  /** Die Zuklapp-Vorgabe DIESES Blocks. `undefined` = nicht zuklappbar (siehe `Section`). */
  collapseDefault: boolean | undefined;
}

export type StackBlock<Ctx> = (ctx: Ctx & BlockRenderExtras) => Promise<ReactNode>;

/**
 * Bindet die Beschaffung eines Blocks an seine Darstellung.
 *
 * Der Datentyp `T` wird aus `load` erschlossen und gegen `render` geprüft — und danach vergessen.
 * Genau deshalb passen fünfzehn Blöcke mit fünfzehn verschiedenen Datenformen in EINE Tabelle,
 * ohne dass irgendwo `any` steht: die Verbindung besteht innerhalb des Aufrufs, nach aussen ist
 * jeder Block dasselbe.
 *
 * **`load` gibt `null`, wenn der Block nichts zu zeigen hat.** Das ist keine Konvention der
 * Bequemlichkeit, sondern die Bedingung dafür, dass ein anderer Block sich auf ihn beziehen kann
 * (das KG-Ziel weicht der Session-Karte aus): eine zweite Abbruchbedingung im `render` wäre für
 * jeden ausserhalb unsichtbar.
 */
export function block<Ctx, T>(def: {
  load: (ctx: Ctx) => Promise<T>;
  render: (data: T, ctx: Ctx & BlockRenderExtras) => ReactNode;
}): StackBlock<Ctx> {
  return async (ctx) => def.render(await def.load(ctx), ctx);
}

/**
 * Lädt und rendert die sichtbaren Blöcke einer Oberfläche in der wirksamen Reihenfolge.
 *
 * Die Tabelle ist ein VOLLSTÄNDIGER Record über die Ids genau dieser Oberfläche — daran hängt
 * dieselbe Compiler-Garantie wie bei den Block-Records aus Etappe C: ein vergessener Block ist ein
 * Typfehler, ein erfundener ebenso. Die Oberfläche kommt aus dem Layout selbst, es gibt also gar
 * keine Gelegenheit, eine fremde Tabelle durchzureichen.
 *
 * Geladen wird PARALLEL: die Blöcke wissen nichts voneinander, und was sie sich teilen, teilen sie
 * über die `cache()`-Schicht in `dashboardData.ts` — die erste Anfrage stösst die Arbeit an, alle
 * weiteren bekommen dasselbe Versprechen.
 */
export async function renderStack<S extends BlockSurface, Ctx>(
  layout: ResolvedLayout<S>,
  ctx: Ctx,
  table: Record<BlockIdOf<S>, StackBlock<Ctx>>,
): Promise<{ id: string; node: ReactNode }[]> {
  return Promise.all(
    layout.visible.map(async (b) => ({
      id: b.id as string,
      node: await table[b.id]({ ...ctx, collapseDefault: layout.collapseDefault(b.id) }),
    })),
  );
}
