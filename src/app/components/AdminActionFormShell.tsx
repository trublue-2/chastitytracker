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
    <main className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
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
    </main>
  );
}
