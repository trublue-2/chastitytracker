"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { NOTICE_VERSION } from "@/lib/notice";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import { quietLinkCls } from "@/app/components/inputStyles";
import { LockClosedIcon, LockOpenIcon } from "@/app/components/lockIcons";

/**
 * Der einmalige Umstellungs-Hinweis auf v6 (Issue #87).
 *
 * **Warum es ihn gibt.** Bis v5 war die Farbe eine Vorliebe — hell oder dunkel, dazu eine
 * Farbwelt-Auswahl. Ab v6 sagt sie den Zustand. Wer die App vorher benutzt hat, hat Grün als
 * „alles in Ordnung" gelernt; ab jetzt heisst es „verschlossen". Eine gelernte Bedeutung fällt
 * weg, und ohne diesen Bildschirm erfährt er es nirgends — die Farbwelt-Einstellung, in der man
 * hätte nachsehen können, ist mit derselben Änderung verschwunden.
 *
 * **Der Merker liegt am `User`, nicht im Gerätespeicher** (`notice.ts` begründet das). Deshalb
 * quittiert der Knopf über die API und nicht über `localStorage`.
 *
 * **Optimistisch geschlossen, ohne Erfolgsprüfung.** Schlägt der PATCH fehl, ist die Folge, dass
 * der Hinweis beim nächsten Aufruf noch einmal erscheint — das ist ein hinnehmbarer Ausgang und
 * allemal besser, als den Nutzer vor einem Fehlerdialog stehen zu lassen, den er nicht auflösen
 * kann. Ein Hinweis ist kein Formular.
 */
export default function ChangeoverNotice() {
  const t = useTranslations("notice");
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    void fetch("/api/settings/notice-seen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noticeSeenVersion: NOTICE_VERSION }),
      // `keepalive`, weil daneben ein Link steht: ein Klick darauf navigiert weg und schnitte die
      // laufende Anfrage sonst ab — der Hinweis käme wieder. Dieselbe Form nutzt
      // `useLocaleSwitcher` aus demselben Grund.
      keepalive: true,
    }).catch(() => { /* siehe Docblock: dann steht er beim nächsten Mal wieder da */ });
  }

  return (
    <Card variant="semantic" semantic="request">
      <div className="flex flex-col gap-3">
        <p className="text-zeile font-semibold text-foreground">{t("title")}</p>
        <p className="text-fliess text-foreground-muted">{t("intro")}</p>

        {/* Die Regel als Legende statt als Satz: sie ist eine Zuordnung, und eine Zuordnung liest
            man schneller als Fliesstext. Die Zeichen sind dieselben, die überall in der App
            stehen — wer den Hinweis wegklickt, hat sie hier schon einmal gesehen. */}
        <ul className="flex flex-col gap-1.5">
          <li className="flex items-start gap-2 text-fliess">
            <LockClosedIcon size={16} className="shrink-0 mt-0.5 text-lock" aria-hidden />
            <span className="text-foreground">{t("legendLocked")}</span>
          </li>
          <li className="flex items-start gap-2 text-fliess">
            <LockOpenIcon size={16} className="shrink-0 mt-0.5 text-unlock" aria-hidden />
            <span className="text-foreground">{t("legendOpen")}</span>
          </li>
        </ul>

        <p className="text-neben text-foreground-faint">{t("caveats")}</p>
        <p className="text-neben text-foreground-faint">{t("unchanged")}</p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={dismiss}>{t("understood")}</Button>
          {/* Quittiert MIT: der Hinweis hängt seit v6 im Bereichs-Layout, stünde also auf der
              Changelog-Seite gleich wieder da — ausgerechnet dort, wohin er selbst verweist. Wer
              den Link nimmt, hat ihn gelesen; das ist Quittung genug. */}
          <Link href="/dashboard/changelog" onClick={dismiss} className={quietLinkCls}>
            {t("whatElse")}
          </Link>
        </div>
      </div>
    </Card>
  );
}
