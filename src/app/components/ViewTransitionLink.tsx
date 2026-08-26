"use client";

import { type ReactNode, type MouseEvent } from "react";
import Link from "next/link";
import useViewTransition from "@/app/hooks/useViewTransition";

interface Props {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /** Der aktive Eintrag einer Navigation.
   *
   *  Muss hier durchgereicht werden, und zwar AUSDRÜCKLICH: TypeScript prüft JSX-Attribute mit
   *  Bindestrich nicht gegen die Props: `<ViewTransitionLink aria-current="page">` compiliert
   *  anstandslos und wird beim Rendern stillschweigend weggeworfen. Der Fehler ist damit weder im
   *  Build noch im Bild zu sehen — nur der Screenreader schweigt weiter. */
  "aria-current"?: "page";
}

/**
 * ViewTransitionLink — drop-in replacement for next/link that triggers
 * a View Transition animation on navigation.
 *
 * Falls back to standard Link behavior on unsupported browsers.
 */
export default function ViewTransitionLink({ href, children, className, onClick, "aria-current": ariaCurrent }: Props) {
  const { navigateWithTransition } = useViewTransition();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // Let modified clicks (cmd+click, ctrl+click) behave normally
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    e.preventDefault();
    onClick?.();
    navigateWithTransition(href);
  }

  return (
    <Link href={href} className={className} onClick={handleClick} aria-current={ariaCurrent}>
      {children}
    </Link>
  );
}
