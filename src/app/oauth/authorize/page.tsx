import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ShieldCheck } from "lucide-react";
import Card from "@/app/components/Card";
import Button from "@/app/components/Button";
import { getClient, clientAllowsRedirect } from "@/lib/oauth";

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

  const { client_id, redirect_uri, scope, state, code_challenge, client_name } = params;

  // Missing params — show generic error
  if (!client_id || !redirect_uri || !code_challenge) {
    return <OAuthError message="Ungültige Anfrage: fehlende Parameter." />;
  }

  // Validate client and redirect_uri server-side — never trust URL params alone.
  // This prevents open redirects and phishing via crafted client_name params.
  const client = await getClient(client_id);
  if (!client || !clientAllowsRedirect(client, redirect_uri)) {
    return <OAuthError message="Ungültige Anfrage: unbekannter Client oder redirect_uri nicht registriert." />;
  }

  // Not logged in → redirect to login, then back here
  if (!session) {
    const returnUrl = `/oauth/authorize?${new URLSearchParams(params as Record<string, string>).toString()}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(returnUrl)}`);
  }

  const scopeList = (scope ?? "read").split(" ").filter(Boolean);
  // Use the DB-stored client name — never the URL param (attacker-controlled)
  const appName = client.clientName;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Card>
          <div className="flex flex-col items-center gap-5 p-6">
            <div className="w-14 h-14 rounded-2xl bg-lock flex items-center justify-center">
              <ShieldCheck size={28} className="text-white" />
            </div>

            <div className="text-center">
              <h1 className="text-lg font-semibold mb-1">Zugriff erlauben?</h1>
              <p className="text-sm text-foreground-muted">
                <strong>{appName}</strong> möchte auf deinen ChastityTracker zugreifen.
              </p>
            </div>

            <div className="w-full rounded-xl border border-border bg-surface-subtle p-4">
              <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-2">
                Berechtigungen
              </p>
              <ul className="space-y-1">
                {scopeList.includes("read") && (
                  <li className="text-sm flex items-start gap-2">
                    <span className="text-lock mt-0.5">✓</span>
                    <span>Lesezugriff auf Tracker-Daten (Einschlüsse, Statistiken, Strafbuch)</span>
                  </li>
                )}
              </ul>
              <p className="text-xs text-foreground-faint mt-3">
                Kein Schreibzugriff — keine Änderungen an deinen Daten möglich.
              </p>
            </div>

            <p className="text-xs text-foreground-faint text-center">
              Eingeloggt als <strong>{session?.user?.name}</strong>
            </p>

            <form action="/api/oauth/authorize" method="POST" className="w-full flex flex-col gap-3">
              <input type="hidden" name="client_id" value={client_id} />
              <input type="hidden" name="redirect_uri" value={redirect_uri} />
              <input type="hidden" name="scope" value={scope ?? "read"} />
              <input type="hidden" name="state" value={state ?? ""} />
              <input type="hidden" name="code_challenge" value={code_challenge} />

              <Button type="submit" variant="semantic" semantic="lock" fullWidth>
                Erlauben
              </Button>

              <a
                href={(() => { const u = new URL(redirect_uri); u.searchParams.set("error", "access_denied"); if (state) u.searchParams.set("state", state); return u.toString(); })()}
                className="text-sm text-center text-foreground-muted hover:text-foreground transition"
              >
                Ablehnen
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
