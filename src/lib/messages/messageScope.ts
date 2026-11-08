/**
 * WELCHER Posteingang gemeint ist — der eigene (Träger) oder der über die eigenen Träger
 * (Keyholder). Es gibt keinen dritten, und beide Seiten sprechen dieselbe Oberfläche.
 *
 * Bewusst OHNE Importe — dieselbe Regel wie in `messageCategories.ts`: Glocke, Seiten und die
 * Client-Liste teilen sich diese Tabelle, und ein Wert-Import aus einer Server-Komponente zöge
 * `next-intl/server` in den Browser-Bundle.
 */
export type MessageScope = "own" | "keyholder";

/**
 * Alles, worin sich die beiden Posteingänge unterscheiden — in EINER Tabelle.
 *
 * Vorher waren es drei Schreibweisen derselben zweiwertigen Unterscheidung: der Typ hier, eine
 * eigene `MessageApiBase`-Union in der Liste, und die Ziel-Tabelle der Glocke; dazu schrieb jede der
 * beiden Seiten ihren Titel-Schlüssel selbst hin. Getrennt geführt liefe die Glocke im
 * Admin-Bereich auf den Posteingang des Trägers, während ihre Beschriftung (und damit die Ansage
 * für Screenreader) den des Keyholders verspräche — und die Liste darunter riefe eine dritte
 * Endpunkt-Familie.
 *
 * `titleKey`/`introKey` liegen im Namensraum `messages`, `apiBase` ist die Endpunkt-Familie
 * (`…`, `…/[id]`, `…/[id]/read`, `…/bulk` — beide sprechen dieselben Pfade,
 * siehe `messageInboxRoutes.ts`).
 */
export const MESSAGE_SCOPES: Record<
  MessageScope,
  { href: string; apiBase: string; titleKey: string; introKey: string }
> = {
  own: {
    href: "/dashboard/messages",
    apiBase: "/api/messages",
    titleKey: "title",
    introKey: "intro",
  },
  keyholder: {
    href: "/admin/messages",
    apiBase: "/api/admin/messages",
    titleKey: "keyholderTitle",
    introKey: "keyholderIntro",
  },
};
