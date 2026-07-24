import { type ReactNode } from "react";

/** Ein gestapelter Block der Dashboard-Spalte: zentrierte Spaltenbreite + Seitenrand, sonst nichts.
 *
 *  BEWUSST OHNE vertikale Abstände: der Abstand zwischen zwei Blöcken kommt vom `gap` des Elters
 *  (`dashboard/page.tsx`: `flex flex-col gap-4`; Keyholder-Sicht: das `gap-4` des `<main>` in
 *  `admin/users/[id]/layout.tsx`, wo ActiveWearSessions und CategoryGoalsLive ebenfalls landen).
 *  Blöcke, die sich selbst ausblenden (`return null`), sind dann kein Flex-Item mehr und
 *  überspringen ihren Abstand automatisch. Trügen die Blöcke ihr eigenes `pt-`/`pb-`, müsste jeder
 *  wissen, was seine Nachbarn mitbringen — genau daraus entstand v4.51.38 (Box-Karte ohne `pb`
 *  klebte am Block darunter, sobald ActiveWearSessions nichts rendert). Deshalb hier KEIN `py-*`
 *  ergänzen — und auch nicht über `className` hereinreichen.
 *
 *  `max-w-2xl` ist die Spaltenbreite des Sub-Dashboards. Auf der breiteren Keyholder-Seite
 *  (`max-w-5xl`) sind die beiden geteilten Blöcke dadurch schmaler als ihre Nachbarn — so war es
 *  vor dieser Komponente schon, und es bleibt bewusst so. */
export default function DashboardBlock({
  as: Tag = "div",
  className = "",
  children,
}: {
  /** `main` für den einen Landmark-Block der Seite (DashboardClient), sonst `div`. */
  as?: "div" | "main";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={["w-full max-w-2xl mx-auto px-4", className].filter(Boolean).join(" ")}>
      {children}
    </Tag>
  );
}
