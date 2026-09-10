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
 * Der Statistik-Kopf (`StatsMain`, `statsBlocks`) läuft seit v6.1.4 ebenfalls hierüber. Er hatte
 * zwei `<a>` ohne Pfeil, die nicht nur von dieser Figur abwichen, sondern voneinander: einmal
 * `text-sm`, einmal `text-neben`, beide mit dem falschen Hover. Beide Stellen bekommen ihr `href`
 * heute von keinem Aufrufer — das ist der Grund, warum es niemandem auffiel, und keiner, sie
 * abweichen zu lassen: der erste Aufrufer, der es setzt, bekommt so die richtige Fassung.
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
