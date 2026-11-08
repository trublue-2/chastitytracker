/**
 * Ein gemerkter Zugangs-Token für einen Push-Dienst — einmal geholt, bis kurz vor Ablauf benutzt.
 *
 * Gemeinsamer Unterbau von `apnsAuth.ts` (Provider-JWT) und `fcmAuth.ts` (OAuth-Access-Token):
 * beide Dienste drosseln, wer je Push neu signiert bzw. neu anfragt, und beide Tokens hängen an
 * einem Schlüssel, dessen Wechsel den Merker verwerfen muss.
 */
export interface MintedToken {
  value: string;
  /** Wie lange der Token ab `nowMs` wiederverwendet werden darf (schon mit Sicherheitsabstand). */
  reuseForMs: number;
}

export interface TokenCache {
  /** `identity`: woran der Token hängt — ein anderer Wert (Rotation, anderer Test) verwirft ihn. */
  get(identity: string, nowMs: number, mint: () => Promise<MintedToken>): Promise<string>;
  reset(): void;
}

export function createTokenCache(): TokenCache {
  let cached: { value: string; validUntilMs: number; identity: string } | null = null;
  /** Läuft gerade eine Anfrage, hängen sich parallele Aufrufer (ein Push je Gerät) an dieselbe. */
  let pending: { promise: Promise<string>; identity: string } | null = null;

  return {
    get(identity, nowMs, mint) {
      if (cached && cached.identity === identity && nowMs < cached.validUntilMs) return Promise.resolve(cached.value);
      // Nur eine Anfrage für DENSELBEN Schlüssel teilen — sonst bekäme ein Aufrufer mit neuem
      // Schlüssel den Token des alten.
      if (pending && pending.identity === identity) return pending.promise;
      const minting = (async () => {
        const t = await mint();
        cached = { value: t.value, validUntilMs: nowMs + t.reuseForMs, identity };
        return t.value;
      })();
      // Zurücksetzen NACH der Zuweisung (auch bei Fehlschlag): ein `finally` im Rumpf liefe bei einem
      // synchronen Wurf vor `pending = …` und liesse das gescheiterte Versprechen für immer stehen.
      pending = { promise: minting, identity };
      const clear = () => { if (pending?.promise === minting) pending = null; };
      minting.then(clear, clear);
      return minting;
    },
    reset() {
      cached = null;
      pending = null;
    },
  };
}
