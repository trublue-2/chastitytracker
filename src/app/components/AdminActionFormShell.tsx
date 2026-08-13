import Link from "next/link";
import Card from "@/app/components/Card";
import type { ReactNode } from "react";

interface Props {
  userId: string;
  backLabel: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  children: ReactNode;
  /** Ziel des Zurück-Pfeils. Vorgabe ist der Aktionen-Hub — für ein Formular, das von woanders
   *  erreichbar ist, muss der Pfeil dorthin zurückführen, wo der Nutzer herkam. Sonst führt
   *  Speichern an die eine Stelle und Abbrechen an eine andere. */
  backHref?: string;
}

export default function AdminActionFormShell({ userId, backLabel, icon, iconBg, iconColor, title, children, backHref }: Props) {
  return (
    <main className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <Link href={backHref ?? `/admin/users/${userId}/aktionen`} className="text-sm text-foreground-faint hover:text-foreground transition">
        ← {backLabel}
      </Link>
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center gap-3">
          <div className="size-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: iconBg }}>
            <span style={{ color: iconColor }}>{icon}</span>
          </div>
          <h1 className="text-base font-semibold text-foreground text-balance">{title}</h1>
        </div>
        <div className="px-5 py-5">{children}</div>
      </Card>
    </main>
  );
}
