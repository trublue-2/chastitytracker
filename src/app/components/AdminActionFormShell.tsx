import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { formColCls } from "@/app/components/inputStyles";

/**
 * Der Kopf eines Aktions-/Erfassungs-Formulars — Rücklink, Zeichen, Titel — und darunter das
 * Formular selbst.
 *
 * **Die Hülle gehört BEIDEN Rollen.** Sie ist im Keyholder-Bereich entstanden und hiess deshalb
 * nach ihm; dieselbe Aufgabe stellt sich aber auf jeder Erfassungs-Seite des Trägers, und die
 * bauten den Kopf zehnmal von Hand nach (`text-sm`-Link, `text-xl font-bold`-Titel, kein Zeichen).
 * Das ist die Bruchkante aus Issue #85: dieselbe Handlung, zwei Anmutungen, je nachdem WER sie
 * ausführt — und die Trägerin erfasst häufiger als die Keyholderin.
 *
 * Der Unterschied zwischen den beiden Aufrufern ist die LANDMARKE, nicht das Aussehen, und er hat
 * einen sachlichen Grund (siehe die beiden Exporte unten). Alles andere — Spalte, Abstände, Serif,
 * Farbe des Zeichens — ist geteilt und steht nur hier.
 *
 * Die Datei heisst weiterhin `AdminActionFormShell.tsx`. Der ehrliche Name wäre
 * `ActionFormShell.tsx`; die Umbenennung berührt die dreizehn Aufrufstellen unter
 * `admin/users/[id]/aktionen/` und wurde deshalb nicht in diesem Durchgang gemacht.
 */
interface ShellProps {
  backHref: string;
  backLabel: string;
  icon: ReactNode;
  iconColor: string;
  title: string;
  /** Ein Satz unter dem Titel, der den Bildschirm erklärt. Gehört in den Kopf und nicht als erstes
   *  Kind ins Formular — sonst steht er im Feld-Rhythmus statt im Kopf-Rhythmus. */
  subtitle?: ReactNode;
  children: ReactNode;
}

/** Rücklink, Zeichen + Titel, optionaler Untertitel, Formular. Der Teil, der für beide Rollen
 *  gleich ist — er steht genau einmal, damit er nicht wieder auseinanderlaufen kann. */
function ShellBody({ backHref, backLabel, icon, iconColor, title, subtitle, children }: ShellProps) {
  return (
    <>
      <Link href={backHref} className="text-neben text-foreground-faint hover:text-foreground transition">
        ← {backLabel}
      </Link>
      {/* Kein Kasten um das Formular und keine getönte Kachel um sein Zeichen. Der Titel benennt
          den Bildschirm — dafür ist die Serif da —, das Zeichen steht daneben in der Farbe der
          Handlung. Die getönte Kachel dahinter sagte nichts, was die Farbe nicht schon sagt. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <span className="flex-shrink-0" style={{ color: iconColor }}>{icon}</span>
          <h1 className="font-serif text-titel text-foreground text-balance">{title}</h1>
        </div>
        {subtitle && <p className="text-fliess text-foreground-muted">{subtitle}</p>}
      </div>
      <div>{children}</div>
    </>
  );
}

/**
 * Die Fassung für den Keyholder-Bereich.
 *
 * `div`, nicht `main`: alle Aufrufstellen liegen unter `admin/users/[id]/layout.tsx`, und das
 * rendert bereits ein `<main>`. Zwei Landmarken desselben Typs auf einer Seite sind für einen
 * Screenreader kein Detail — „Hauptbereich" wird dadurch zur Frage statt zur Antwort.
 *
 * Und dort greift `formColCls` wirklich: die Keyholder-Spalte steht auf `wideColCls` (768 px), ein
 * Formular liest sich auf dem Lesemass (672 px) besser. Das ist KEINE zweite Spalte neben der des
 * Layouts (das war der Fehler, der hier stand: `main` in `main`, Seitenrand doppelt, `py-6`
 * doppelt), sondern eine Verengung INNERHALB.
 *
 * Das `py-6` kommt vom `<main>` des Layouts und darf hier nicht noch einmal stehen.
 */
export default function AdminActionFormShell({
  userId,
  backHref,
  ...rest
}: Omit<ShellProps, "backHref"> & {
  userId: string;
  /** Ziel des Zurück-Pfeils. Vorgabe ist der Aktionen-Hub — für ein Formular, das von woanders
   *  erreichbar ist, muss der Pfeil dorthin zurückführen, wo der Nutzer herkam. Sonst führt
   *  Speichern an die eine Stelle und Abbrechen an eine andere. */
  backHref?: string;
}) {
  return (
    <div className={`${formColCls} flex flex-col gap-4`}>
      <ShellBody {...rest} backHref={backHref ?? `/admin/users/${userId}/aktionen`} />
    </div>
  );
}

/**
 * Die Fassung für den Träger-Bereich — die (+)-Erfassung und das Bearbeiten eines Eintrags.
 *
 * `main`, nicht `div`, und das ist kein Widerspruch zur Fassung darüber, sondern ihr Spiegelbild:
 * `dashboard/layout.tsx` rendert KEIN `<main>`, jede Seite darunter setzt ihre eigene Landmarke
 * (`eintraege`, `categories`, `geraete`, `settings`, `stats` tun es). Die zehn Erfassungs-Seiten
 * taten es bisher als einzige nicht — die meistbenutzten Bildschirme der App hatten gar keinen
 * Hauptbereich. Zwei Landmarken sind falsch, keine auch.
 *
 * `formColCls` steht hier bewusst mit und ist bewusst FOLGENLOS: die Träger-Spalte
 * (`readingColCls`) ist bereits das Lesemass, `max-w-2xl` in `max-w-2xl` kappt nichts, und weil
 * `formColCls` kein eigenes `px-*` mitbringt, verdoppelt sich auch der Seitenrand nicht. Es steht
 * mit, weil die Verengung Sache der Hülle ist und nicht Sache der Spalte darüber: zöge jemand
 * `readingColCls` breiter, blieben die Formulare, wo sie hingehören.
 *
 * `py-6` dagegen MUSS hier stehen — anders als das Keyholder-Layout bringt das Dashboard-Layout
 * keinen vertikalen Abstand mit; die zehn Seiten trugen ihn bisher selbst.
 */
/**
 * Die Träger-Fassung. `main` statt `div`, weil `dashboard/layout.tsx` — anders als das
 * Keyholder-Layout — keine Landmarke setzt und diese zehn Seiten bis #85 als einzige des Bereichs
 * gar keine hatten. `py-6` aus demselben Grund: das Keyholder-`main` bringt es mit, das
 * Dashboard-Layout nicht.
 *
 * `backHref`/`backLabel` sind optional und zeigen von sich aus auf die Übersicht — das ist bei
 * allen elf Aufrufstellen dasselbe Ziel, und jede von ihnen hielt dafür bisher einen eigenen
 * `getTranslations("nav")`-Aufruf. Die Schwesterhülle macht es mit `backHref ?? …` genauso.
 */
export function EntryActionFormShell({ backHref, backLabel, ...rest }: Omit<ShellProps, "backHref" | "backLabel"> & {
  backHref?: string;
  backLabel?: string;
}) {
  const t = useTranslations("nav");
  return (
    <main className={`${formColCls} py-6 flex flex-col gap-4`}>
      <ShellBody backHref={backHref ?? "/dashboard"} backLabel={backLabel ?? t("overview")} {...rest} />
    </main>
  );
}
