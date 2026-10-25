import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { titleCls } from "@/app/components/inputStyles";
import { auth } from "@/lib/auth";
import { ShieldCheck } from "lucide-react";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import { getClient, clientAllowsRedirect } from "@/lib/oauth";
import { APP_NAME } from "@/lib/constants";

interface Props {
  searchParams: Promise<{
    client_id?: string;
    redirect_uri?: string;
    scope?: string;
    state?: string;
    code_challenge?: string;
    client_name?: string;
  }>;
}

export default async function OAuthAuthorizePage({ searchParams }: Props) {
  const session = await auth();
  const params = await searchParams;
  const t = await getTranslations("oauth");

  const { client_id, redirect_uri, scope, state, code_challenge, client_name } = params;

  // Missing params — show generic error
  if (!client_id || !redirect_uri || !code_challenge) {
    return <OAuthError message={t("invalidRequest")} />;
  }

  // Validate client and redirect_uri server-side — never trust URL params alone.
  // This prevents open redirects and phishing via crafted client_name params.
  const client = await getClient(client_id);
  if (!client || !clientAllowsRedirect(client, redirect_uri)) {
    return <OAuthError message={t("invalidClient")} />;
  }

  // Not logged in → redirect to login, then back here
  if (!session) {
    const returnUrl = `/oauth/authorize?${new URLSearchParams(params as Record<string, string>).toString()}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(returnUrl)}`);
  }

  // Nur Admins bekommen einen Token (`POST /api/oauth/authorize` erzwingt es mit der Rolle aus der DB);
  // die Seite zeigt den Grund, statt einen Knopf anzubieten, der ins Leere läuft.
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  if (!isAdmin) return <OAuthError message={t("adminOnly")} />;

  const scopeList = (scope ?? "read").split(" ").filter(Boolean);
  // Use the DB-stored client name — never the URL param (attacker-controlled)
  const appName = client.clientName;

  // Wohin der Browser nach der Entscheidung geht — aus der REGISTRIERTEN redirect_uri (oben gegen den
  // Client geprüft), nicht aus dem Namen, den der Client sich gibt. Wer hier einen fremden Host liest,
  // soll „Erlauben" nicht klicken. Eigene Schemata (App-Rückruf) zeigen `schema://host`.
  const target = new URL(redirect_uri);
  const redirectHost = target.protocol === "https:" || target.protocol === "http:" ? target.host : `${target.protocol}//${target.host}`;
  const denyUrl = new URL(redirect_uri);
  denyUrl.searchParams.set("error", "access_denied");
  if (state) denyUrl.searchParams.set("state", state);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Card>
          <div className="flex flex-col items-center gap-5 p-6">
            <div className="w-14 h-14 rounded-2xl bg-lock flex items-center justify-center">
              <ShieldCheck size={28} className="text-btn-primary-text" />
            </div>

            <div className="text-center">
              <h1 className={`${titleCls} mb-1`}>{t("title")}</h1>
              <p className="text-sm text-foreground-muted">
                {t.rich("intro", { client: appName, app: APP_NAME, strong: (chunks) => <strong>{chunks}</strong> })}
              </p>
              <p className="text-sm text-foreground-muted mt-2">
                {t.rich("redirectTo", { host: redirectHost, code: (chunks) => <code className="font-mono font-medium text-foreground break-all">{chunks}</code> })}
              </p>
            </div>

            <div className="w-full rounded-xl border border-border bg-surface-raised p-4">
              <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-2">
                {t("permissions")}
              </p>
              <ul className="space-y-1">
                {scopeList.includes("read") && (
                  <li className="text-sm flex items-start gap-2">
                    <span className="text-lock mt-0.5">✓</span>
                    <span>{t("permRead")}</span>
                  </li>
                )}
                <li className="text-sm flex items-start gap-2">
                  <span className="text-lock mt-0.5">✓</span>
                  <span>{t("permKeyholder")}</span>
                </li>
              </ul>
              <p className="text-xs text-foreground-faint mt-3">
                {t("noteAdmin")}
              </p>
            </div>

            <p className="text-xs text-foreground-faint text-center">
              {t.rich("loggedInAs", { name: session?.user?.name ?? "", strong: (chunks) => <strong>{chunks}</strong> })}
            </p>

            <form action="/api/oauth/authorize" method="POST" className="w-full flex flex-col gap-3">
              <input type="hidden" name="client_id" value={client_id} />
              <input type="hidden" name="redirect_uri" value={redirect_uri} />
              <input type="hidden" name="scope" value={scope ?? "read"} />
              <input type="hidden" name="state" value={state ?? ""} />
              <input type="hidden" name="code_challenge" value={code_challenge} />

              <Button type="submit" variant="semantic" semantic="lock" fullWidth>
                {t("allow")}
              </Button>

              <a
                href={denyUrl.toString()}
                className="text-sm text-center text-foreground-muted hover:text-foreground transition"
              >
                {t("deny")}
              </a>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}

function OAuthError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card>
        <div className="p-6 text-center">
          <p className="text-sm text-warn">{message}</p>
        </div>
      </Card>
    </div>
  );
}
