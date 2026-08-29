import { codedError, codeOf } from "@/lib/codedError";
import { reportReachable, reportStalled } from "@/lib/connectionHealth";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * Zeitlimit einer gewöhnlichen Client-Anfrage.
 *
 * **Warum es das überhaupt braucht.** `fetch` hat von sich aus KEINES. Bei schlechter Abdeckung
 * steht die Verbindung, es fliesst nur nichts — die Promise bleibt dann offen, bis das
 * Betriebssystem irgendwann aufgibt, oft Minuten. Sie WIRFT nicht, und deshalb sprang die
 * Offline-Warteschlange nicht an: die fängt einen Fehler, und einen Fehler gab es nie.
 *
 * Acht Sekunden sind grosszügig für eine JSON-Mutation auf eine Instanz mit SQLite und knapp genug,
 * dass niemand sie für „hängt" hält. Server-seitig gilt dieselbe Disziplin längst
 * (`nativePush` 8 s, `heimdallNotify` 3 s, `upstream-changelog` 10 s) — nur der Client hatte sie
 * nirgends.
 */
export const CLIENT_TIMEOUT_MS = 8_000;

/**
 * Zeitlimit für Anfragen, die ein Bild tragen. Ein Foto vom Handy geht über denselben schlechten
 * Kanal, braucht aber ein Vielfaches der Zeit — mit `CLIENT_TIMEOUT_MS` bräche jeder Upload über
 * Mobilfunk ab, den es vorher gab.
 */
export const UPLOAD_TIMEOUT_MS = 60_000;

/** Code des Fehlers, den {@link fetchWithTimeout} beim Ablauf wirft. Modul-privat: die Aufrufer
 *  reihen bei JEDEM Fehlschlag ein und müssen den Grund gar nicht unterscheiden. */
const FETCH_TIMEOUT = "FETCH_TIMEOUT";

/** Ob dieser Fehler eine abgelaufene Anfrage ist (und nicht irgendein anderer Netzwerk-Defekt). */
function isTimeout(e: unknown): boolean {
  return codeOf(e) === FETCH_TIMEOUT;
}

/**
 * `fetch` mit Zeitlimit — die einzige Form, in der der Client eine Anfrage stellen sollte.
 *
 * Läuft die Zeit ab, wird die Anfrage abgebrochen und ein `codedError(FETCH_TIMEOUT)` geworfen;
 * `isTimeout(e)` erkennt ihn. Das ist der Unterschied, der die vorhandene Offline-Maschinerie
 * überhaupt greifen lässt: aus „hängt für immer" wird ein Fehler, den ein `catch` sieht.
 *
 * Ein `signal` des Aufrufers bleibt wirksam — es wird an denselben Abbruch gehängt, statt
 * überschrieben zu werden. `PruefungFormCore` bricht seine Vision-Abfrage so ab, wenn der Nutzer
 * das Bild wechselt. Diese Weiterreichung ist nicht optional: ohne sie überschriebe das `...init`
 * das Signal des Aufrufers, und sein Abbruch ginge STILL verloren — der schlimmste Ausgang, weil
 * der Aufrufer weiter glaubt, abgebrochen zu haben.
 *
 * **Grenze, die man kennen muss:** das Zeitlimit deckt bis zu den Antwort-Kopfzeilen. Bleibt die
 * Leitung erst beim Lesen des Rumpfes stehen (`res.json()` beim Aufrufer), greift es nicht mehr.
 * Für die kleinen JSON-Antworten hier kommt der Rumpf praktisch mit den Kopfzeilen; bei einer
 * grossen Antwort wäre eine `fetchJsonWithTimeout` nötig, die den Rumpf noch innerhalb der Frist
 * liest.
 *
 * Nebenwirkung mit Absicht: jede Antwort und jeder Ablauf melden sich bei `connectionHealth`. Das
 * ist die einzige Stelle, an der die App zuverlässig erfährt, ob die Leitung trägt — an den
 * Aufrufern verteilt, wäre die Meldung irgendwo vergessen worden.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms: number = CLIENT_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const caller = init.signal;
  if (caller?.aborted) throw caller.reason;

  const forward = () => ctrl.abort(caller!.reason);
  caller?.addEventListener("abort", forward);
  const timer = setTimeout(() => ctrl.abort(codedError(FETCH_TIMEOUT)), ms);

  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    // Auch ein 500er zählt als erreichbar: die Frage ist, ob Pakete fliessen.
    reportReachable();
    return res;
  } catch (e) {
    // NUR das Zeitlimit färbt die Verbindung. Ein Abbruch durch den Aufrufer sagt nichts über sie
    // aus, und ein `TypeError` bei ausgeschaltetem Netz ist der Fall, den `navigator.onLine`
    // bereits korrekt meldet.
    if (isTimeout(e)) reportStalled();
    throw e;
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener("abort", forward);
  }
}

/**
 * Liest das `error`-Feld aus einer fehlgeschlagenen API-Antwort (nie werfend — ein nicht-JSON-Body
 * wie eine HTML-Fehlerseite oder ein leerer 502-Body ergibt `null`).
 *
 * Bei Routen mit STABILEN Fehler-CODES (settings/*, auth/*, entries/*) ist das Ergebnis der Code,
 * den `useApiError()` in den `errors`-Namespace auflöst; unbekannte/fehlende Codes fallen dort auf
 * die generische Meldung zurück.
 */
export async function parseApiErrorCode(res: Response): Promise<string | null> {
  const body = await res.json().catch(() => ({}));
  return typeof body?.error === "string" && body.error ? body.error : null;
}

/**
 * Wie `parseApiErrorCode()`, gibt aber direkt eine anzeigbare Meldung zurück.
 *
 * Achtung Abgrenzung: NUR für Routen, deren `error` bereits eine anzeigbare Meldung ist. Routen mit
 * stabilen Fehler-Codes (siehe oben) gehören über `parseApiErrorCode()` + `useApiError()`.
 */
export async function parseApiError(res: Response, fallback: string): Promise<string> {
  return (await parseApiErrorCode(res)) ?? fallback;
}

/**
 * Ein einmaliger Stempel für einen Anlege-Versuch — oder `null`, wenn der Browser keinen sicheren
 * Zufall hat.
 *
 * Dann lieber GAR KEINEN Stempel als einen schwachen: zwei kollidierende Werte desselben Nutzers
 * liessen seinen zweiten Eintrag als vermeintliche Wiederholung des ersten verschwinden — ein
 * VERLORENER Eintrag, also schlimmer als der doppelte, gegen den der Stempel gebaut ist. Ohne
 * Stempel greift die Idempotenz eben nicht; das ist der Zustand von vorher. (Die Konstruktion
 * `Date.now()+Math.random()` hat das Projekt bei `generateUploadFilename` schon einmal ersetzt.)
 *
 * `crypto.randomUUID` gibt es nur in sicheren Kontexten; die App läuft ausschliesslich über HTTPS
 * bzw. localhost, der Fall ist also theoretisch.
 */
function requestStamp(): string | null {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : null;
}

/**
 * URL + RequestInit für einen Eintrag: `entryId` gesetzt = Bearbeiten (PATCH), sonst Anlegen (POST).
 *
 * **Beim ANLEGEN trägt der Rumpf einen `clientRequestId`-Stempel.** Er ist der Schutz gegen die
 * Dublette, die entsteht, wenn der Server schreibt und die Antwort das Zeitlimit reisst: die
 * Offline-Warteschlange speichert den fertigen Rumpf und schickt ihn später erneut — mit demselben
 * Stempel, an dem `/api/entries` ihn wiedererkennt.
 *
 * Er sitzt HIER und nicht in `offlineFetch`, weil hier bekannt ist, wohin die Anfrage geht. Dort
 * stempelte er jede eingereihte Mutation, auch `PATCH /api/tasks/[id]`, wo die Route das Feld nicht
 * kennt — Kosten überall, Nutzen an einer Stelle.
 *
 * Ein PATCH bekommt keinen: eine Bearbeitung wird nicht eingereiht (`initial ? fetch : offlineFetch`
 * in den Formularen), es gibt also keinen zweiten Versuch, den man wiedererkennen müsste. Der
 * Keyholder-Pfad (`postAdminEntry`) aus demselben Grund nicht.
 */
export function entryRequest(entryId: string | null | undefined, payload: unknown): [string, RequestInit] {
  // Ein mitgegebener Stempel gewinnt. Heute gibt keiner einen mit — aber ein Aufrufer, der einen
  // Versuch bewusst wiederholt, hätte ihn sonst stillschweigend verloren, und damit ausgerechnet
  // die Zusage, für die es den Stempel gibt.
  const vorhanden = (payload as { clientRequestId?: unknown } | null)?.clientRequestId;
  const stamp = entryId ? null : (typeof vorhanden === "string" && vorhanden ? vorhanden : requestStamp());
  return [
    entryId ? `/api/entries/${entryId}` : "/api/entries",
    {
      method: entryId ? "PATCH" : "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(stamp ? { ...(payload as object), clientRequestId: stamp } : payload),
    },
  ];
}

/** Legt einen Eintrag für einen fremden User an (Keyholder/Admin-Aktionen). */
export function postAdminEntry(userId: string, payload: object): Promise<Response> {
  return fetchWithTimeout("/api/admin/entries", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ userId, ...payload }),
  });
}

/** Admin-Entry anlegen + Antwort auf die Form-Core-Kontrakt-Form abbilden.
 *  `resolveError` ist der `useApiError()`-Resolver des aufrufenden Formulars — die Route liefert
 *  stabile Fehler-Codes, die Übersetzung passiert im Client.
 *  Rückgabetyp strukturell statt `SubmitResult` aus `@/app/entries/types` — ein `lib/`-Modul
 *  soll nicht auf `app/` zeigen. Zuweisungskompatibel zu `SubmitResult`. */
export async function submitAdminEntry(
  userId: string,
  payload: object,
  resolveError: (code: string | null) => string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await postAdminEntry(userId, payload);
  if (res.ok) return { ok: true };
  return { ok: false, error: resolveError(await parseApiErrorCode(res)) };
}
