import Link from "next/link";
import type { ReactNode } from "react";
import { quietLinkCls } from "@/app/components/inputStyles";

/**
 * Der Rückweg oben auf einer Seite — „← Ziel".
 *
 * Die gemeinsame Figur der Seiten-Rücklinke: die Aktions-Hülle (`AdminActionFormShell`) und die
 * Rücklinke der Formular- und Listenseiten liefen zuvor mit abweichendem Hover
 * (`hover:text-foreground-muted`) und teils `text-sm` neben der kanonischen, leisen Fassung
 * (`quietLinkCls` — Hover auf `text-foreground`, `text-neben`); der Pfeil war mal da, mal nicht.
 *
 * Nimmt `href` (Navigation) ODER `onClick` (schliesst ein Formular an Ort und Stelle, ohne die
 * Seite zu wechseln) — dieselbe Anmutung für beide, damit ein Rücklink nicht wieder je nach
 * Bauart auseinanderläuft. Der Pfeil gehört zur Figur und steht deshalb hier, nicht im Aufrufer.
 *
 * Noch NICHT hierüber laufen die beiden Rücklinke im Statistik-Kopf (`StatsMain`, `statsBlocks`):
 * sie sind ein `<a>` ohne Pfeil und gehören zur Seitenkopf-Frage aus Issue #101 (Teil A), die
 * bewusst offen bleibt.
 */
export default function BackLink(
  props: { children: ReactNode } & ({ href: string } | { onClick: () => void }),
) {
  // `w-fit`: ein Rücklink sitzt oft als Kind eines `flex flex-col` (Formular-Hülle, Listen-Ansicht).
  // Flex-Kinder werden quer gestreckt (`align-items: stretch`) — ohne `w-fit` spannte die Klickfläche
  // die ganze Zeilenbreite auf, obwohl nur „← Ziel" dasteht. Eine der Alt-Fassungen hatte es
  // deshalb schon einzeln; hier gehört es an die Figur.
  const cls = `${quietLinkCls} w-fit`;
  const content = <>← {props.children}</>;
  return "href" in props ? (
    <Link href={props.href} className={cls}>{content}</Link>
  ) : (
    <button type="button" onClick={props.onClick} className={cls}>{content}</button>
  );
}
