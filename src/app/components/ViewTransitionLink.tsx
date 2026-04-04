"use client";

import { type ReactNode, type MouseEvent } from "react";
import Link from "next/link";
import useViewTransition from "@/app/hooks/useViewTransition";

interface Props {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * ViewTransitionLink — drop-in replacement for next/link that triggers
 * a View Transition animation on navigation.
 *
 * Falls back to standard Link behavior on unsupported browsers.
 */
export default function ViewTransitionLink({ href, children, className, onClick }: Props) {
  const { navigateWithTransition } = useViewTransition();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // Let modified clicks (cmd+click, ctrl+click) behave normally
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    e.preventDefault();
    onClick?.();
    navigateWithTransition(href);
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
