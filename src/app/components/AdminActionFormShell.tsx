import Link from "next/link";
import type { ReactNode } from "react";
import { formColCls } from "@/app/components/inputStyles";

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
    /* Die eine benannte Ausnahme von der breiten Keyholder-Spalte.
    
       Ein Formular ist Fliesstext mit Feldern — es liest sich auf 672 px besser als auf 768. Das
       ist KEINE zweite Spalte neben der des Layouts (das war der Fehler, der hier stand: `main` in
       `main`, Seitenrand doppelt, `py-6` doppelt), sondern eine Verengung INNERHALB. Deshalb nur
       `max-w-2xl mx-auto`: kein eigener Seitenrand, keine eigene Landmarke.
    
       Und deshalb als Bauteil statt als Regel: elf Formulare teilen sich diese Hülle, das zwölfte
       bekommt sie durch Benutzung statt durch Erinnerung. */
    <div className={`${formColCls} flex flex-col gap-4`}>
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
