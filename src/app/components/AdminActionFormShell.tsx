import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  userId: string;
  backLabel: string;
  icon: ReactNode;
  iconColor: string;
  title: string;
  children: ReactNode;
  /** Ziel des Zurück-Pfeils. Vorgabe ist der Aktionen-Hub — für ein Formular, das von woanders
   *  erreichbar ist, muss der Pfeil dorthin zurückführen, wo der Nutzer herkam. Sonst führt
   *  Speichern an die eine Stelle und Abbrechen an eine andere. */
  backHref?: string;
}

export default function AdminActionFormShell({ userId, backLabel, icon, iconColor, title, children, backHref }: Props) {
  return (
    /* `div`, nicht `main`: alle elf Aufrufstellen liegen unter `admin/users/[id]/layout.tsx`, und
       das rendert bereits ein `<main>`. Zwei Landmarken desselben Typs auf einer Seite sind für
       einen Screenreader kein Detail — „Hauptbereich" wird dadurch zur Frage statt zur Antwort.

       Und keine eigene Spalte: dasselbe Layout hat sie gesetzt. Von Hand stand hier bisher das
       Lesemass IM breiten Mass — 672 px in 768, Seitenrand doppelt, `py-6` doppelt (48 px oben).
       Das Formular ist damit etwas breiter als vorher; es steht dafür auf derselben Kante wie die
       Reiterleiste darüber und wie jeder andere Reiter. */
    <div className="flex flex-col gap-4">
      <Link href={backHref ?? `/admin/users/${userId}/aktionen`} className="text-neben text-foreground-faint hover:text-foreground transition">
        ← {backLabel}
      </Link>
      {/* Kein Kasten um das Formular und keine getönte Kachel um sein Zeichen. Der Titel benennt
          den Bildschirm — dafür ist die Serif da —, das Zeichen steht daneben in der Farbe der
          Handlung. Die getönte Kachel dahinter sagte nichts, was die Farbe nicht schon sagt. */}
      <div className="flex items-center gap-2.5">
        <span className="flex-shrink-0" style={{ color: iconColor }}>{icon}</span>
        <h1 className="font-serif text-titel text-foreground text-balance">{title}</h1>
      </div>
      <div>{children}</div>
    </div>
  );
}
