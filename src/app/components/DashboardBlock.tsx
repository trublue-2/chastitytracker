import { type ReactNode } from "react";

/** Ein gestapelter Block der Dashboard-Spalte: zentrierte Spaltenbreite + Seitenrand, sonst nichts.
 *
 *  BEWUSST OHNE vertikale Abstände: der Abstand zwischen zwei Blöcken kommt vom `gap` des Elters
 *  (`blockStackCls` — `dashboard/page.tsx`, `StatsMain` und das `<main>` in
 *  `admin/users/[id]/layout.tsx`, wo ActiveWearSessions und CategoryGoalsLive ebenfalls landen).
 *  Blöcke, die sich selbst ausblenden (`return null`), sind dann kein Flex-Item mehr und
 *  überspringen ihren Abstand automatisch. Trügen die Blöcke ihr eigenes `pt-`/`pb-`, müsste jeder
 *  wissen, was seine Nachbarn mitbringen — genau daraus entstand v4.51.38 (Box-Karte ohne `pb`
 *  klebte am Block darunter, sobald ActiveWearSessions nichts rendert). Deshalb hier KEIN `py-*`
 *  ergänzen — und auch nicht über `className` hereinreichen.
 *
 *  Die Vorgabe hier ist die Spalte des Sub-Dashboards (`--container-2xl` = `max-w-2xl`, Seitenrand
 *  = `px-4`). Eine Seite, die ihre Spalte SELBST aufspannt, überschreibt sie per `--block-col` /
 *  `--block-gutter` auf ihrem Container — sonst brächte jeder geteilte Block die schmalere
 *  Sub-Spalte plus einen zweiten Seitenrand mit und sässe eingerückt zwischen seinen Nachbarn.
 *  Einziger solcher Fall heute: `admin/users/[id]/layout.tsx` (`wideColCls`).
 *
 *  Bewusst über CSS-Variablen statt über ein Prop: die Spaltenbreite ist eine Eigenschaft der
 *  Seite, nicht des Blocks. Als Prop wäre sie durch drei geteilte Blöcke und teils zwei Ebenen zu
 *  reichen (`CategoryGoalsToday` → `CategoryGoalsLive`) und an jeder neuen Aufrufstelle erneut zu
 *  setzen. Über `className` ginge es gar nicht zuverlässig: welches `max-w-*` gewinnt, entscheidet
 *  bei Tailwind v4 die Reihenfolge im erzeugten Stylesheet, nicht die im Klassen-String.
 *
 *  (Nicht zu verwechseln mit `StatsMain`: das ist kein gestapelter Block, sondern ein ganzer
 *  Seiteninhalt. Es bekommt seine Spalte ebenfalls von aussen und trägt dasselbe `as`-Prop — dort
 *  aber, um auf `/dashboard/stats` selbst die Landmarke zu sein, während es im Keyholder-Reiter
 *  ein `div` bleibt, weil das Layout dort schon eines setzt.) */
export default function DashboardBlock({
  as: Tag = "div",
  className = "",
  children,
}: {
  /**
   * `main` für den EINEN Block, der die Landmarke seiner Seite ist, sonst `div`. Das sind heute
   * drei: das Dashboard (`DashboardClient`) sowie die Regel- und die Posteingang-Seite. Eine Seite
   * darf genau ein `<main>` haben — `pageMeasures.test.ts` wacht darüber.
   */
  as?: "div" | "main";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={["w-full mx-auto max-w-[var(--block-col,var(--container-2xl))] px-[var(--block-gutter,calc(var(--spacing)*4))]", className].filter(Boolean).join(" ")}>
      {children}
    </Tag>
  );
}
