"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, SearchX } from "lucide-react";
import { useTranslations } from "next-intl";
import EmptyState from "@/app/components/EmptyState";
import { quietLinkCls } from "@/app/components/inputStyles";
import { DEFAULT_WORLD } from "@/lib/client/theme";

type Props =
  | { kind: "notFound"; standalone?: boolean }
  | { kind: "error"; error: Error & { digest?: string }; reset: () => void; standalone?: boolean };

/**
 * Fehler- und 404-Seite der App — das Gegenstück zur englischen Standardseite von Next, die
 * ausserhalb der Farbwelt und ohne Rückweg stand.
 *
 * **`standalone`** (Wurzel-Segment): kein Bereichs-Layout drum herum, also bringt die Seite ihre
 * Welt selbst mit (wie `AuthScreen`). Ohne sie (`dashboard/`, `admin/`) sitzt sie IM Layout: die
 * Navigation bleibt stehen, nur die Seite wird ersetzt — deshalb liegt je Bereich ein eigenes
 * `error.tsx`, denn ein Fehler im Wurzel-Segment risse auch die Navigation mit weg.
 *
 * **Die Meldung des Fehlers wird NIE angezeigt.** `error.message` kann Pfade, SQL oder
 * Bibliotheks-Interna tragen; im Produktivbetrieb maskiert Next sie ohnehin, im Entwicklungsbetrieb
 * nicht. Gezeigt wird nur `digest` — der Verweis, unter dem der Betreiber die Zeile im Server-Log findet.
 */
export default function ErrorScreen(props: Props) {
  const t = useTranslations("errorPages");
  const error = props.kind === "error" ? props.error : null;

  useEffect(() => {
    if (error) console.error(error);
  }, [error]);

  const content = props.kind === "error" ? (
    <EmptyState
      icon={<AlertTriangle size={40} />}
      title={t("errorTitle")}
      description={t("errorDescription")}
      action={{ label: t("retry"), onClick: props.reset }}
    />
  ) : (
    <EmptyState icon={<SearchX size={40} />} title={t("notFoundTitle")} description={t("notFoundDescription")} />
  );

  const body = (
    <div className="flex flex-col items-center gap-2">
      {content}
      {error?.digest && <p className="text-neben text-foreground-faint font-mono">{t("reference", { digest: error.digest })}</p>}
      <Link href="/" className={quietLinkCls}>{t("home")}</Link>
    </div>
  );

  // Die Hülle ist die von `AuthScreen` (Vorgabewelt, Glow, zentriert) — ändert sich dort der Rand der App, hier mit.
  return props.standalone ? (
    <main data-theme={DEFAULT_WORLD} className="world-glow min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-10">
      {body}
    </main>
  ) : (
    <main className="py-10">{body}</main>
  );
}
