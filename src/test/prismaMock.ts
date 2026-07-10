import { vi } from "vitest";

/**
 * TEST-ONLY (liegt bewusst ausserhalb von `src/lib/`: importiert `vitest`, eine devDependency —
 * ein Import aus Produktivcode wäre ein Fehler).
 *
 * Prisma-Doppelgänger für Unit-Tests von Aggregat-Buildern (mcpOverview, mcp/dashboard, …).
 *
 * Diese Builder fächern über ein Dutzend Modelle auf; ein Mock, der jedes Modell und jede Methode
 * einzeln auflistet, wäre länger als der Test und müsste bei jedem neuen Query nachgezogen werden.
 * Stattdessen liefert ein Proxy jedes angefragte Modell lazy nach und gibt pro Lese-Methode den
 * neutralen Leerwert zurück (findMany → [], findFirst/findUnique → null, count → 0).
 *
 * Jede Methode ist ein `vi.fn()` — Tests überschreiben gezielt, was sie brauchen:
 *   prismaMock.user.findUnique.mockResolvedValue(TEST_USER)
 *
 * Bewusst NUR für Lese-Pfade: Schreib-Methoden bekommen keinen sinnvollen Default (null), ein Test,
 * der schreibt, muss sie selbst stubben.
 */

type MockFn = ReturnType<typeof vi.fn>;
export type PrismaMock = Record<string, Record<string, MockFn>>;

/** Neutrale Leerwerte der Lese-Methoden. Frisch pro Aufruf, damit ein mutierender Aufrufer
 *  nicht den Default des nächsten Aufrufs beschädigt. Bewusst nur die Methoden, die die
 *  MCP-Read-Builder wirklich rufen: `aggregate` hätte mit `{}` keinen sicheren Leerwert
 *  (echtes Prisma liefert `{_sum,_count,…}`, ein `._sum.x` würde werfen statt neutral zu sein). */
const EMPTY_RESULT: Record<string, () => unknown> = {
  findMany: () => [],
  findFirst: () => null,
  findUnique: () => null,
  count: () => 0,
};

/** Proxy, der pro Schlüssel beim ERSTEN Zugriff einen Wert erzeugt und danach denselben
 *  zurückgibt. Die Stabilität ist load-bearing: nur so ist `prismaMock.user.findUnique` im Test
 *  dieselbe Mock-Funktion, die der Produktivcode aufruft. `cache.has` statt `=== undefined`:
 *  ein `create`, das undefined liefert, würde sonst bei jedem Zugriff neu laufen. */
function lazyKeyedProxy<T>(create: (key: string) => T): Record<string, T> {
  const cache = new Map<string, T>();
  return new Proxy({} as Record<string, T>, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      if (!cache.has(prop)) cache.set(prop, create(prop));
      return cache.get(prop);
    },
  });
}

/** Baut den Mock: äussere Ebene = Modelle, innere = deren Methoden.
 *  Client-Methoden (`$transaction`, `$queryRaw`, …) sind NICHT modelliert — ohne den Guard käme
 *  ein Modell-Proxy zurück und der Aufruf stürbe als „proxy is not a function" tief im Stack. */
export function createPrismaMock(): PrismaMock {
  return lazyKeyedProxy((model) => {
    if (model.startsWith("$")) {
      throw new Error(`createPrismaMock: prisma.${model} ist nicht gemockt — dieser Mock deckt nur Modell-Lesepfade ab.`);
    }
    return lazyKeyedProxy((method) => vi.fn(async () => EMPTY_RESULT[method]?.() ?? null));
  });
}

/** Der von `loadUserContext` (mcpOverview) bzw. `loadTrackingData` (mcp/common) selektierte User.
 *  Eine Quelle für beide MCP-Vertragstests: kommt ein Feld ins Select, fällt es hier EINMAL auf. */
export const TEST_USER = {
  id: "u1",
  timezone: "Europe/Zurich",
  reinigungErlaubt: true,
  reinigungMaxMinuten: 15,
  reinigungMaxProTag: 2,
  reinigungsFenster: null,
  mcpKeyholderInstructions: "sei streng",
  autoKontrolleAktiv: true,
  autoKontrollePerDayMin: 1,
  autoKontrollePerDayMax: 3,
  autoKontrolleRuheVon: "22:00",
  autoKontrolleRuheBis: "07:00",
  autoKontrolleFristVon: 30,
  autoKontrolleFristBis: 90,
};
