import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Anmeldung mit Benutzername ODER E-Mail — gemeldet, weil ein Keyholder es zweimal mit seiner
 * E-Mail versuchte, im Log „unbekannter Benutzer" stand und er sich für ausgesperrt hielt.
 *
 * Die Attrappe spielt die beiden Abfragen des Helpers nach: `findUnique` (Benutzername exakt, bzw.
 * die Id des E-Mail-Treffers) und `findMany` (alle Konten mit E-Mail, nur Id und Adresse).
 */

interface Row { id: string; username: string; email: string | null }
let users: Row[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { username?: string; id?: string } }) =>
        users.find((u) => (where.username !== undefined ? u.username === where.username : u.id === where.id)) ?? null),
      findMany: vi.fn(async () => users.filter((u) => u.email !== null).map(({ id, email }) => ({ id, email }))),
    },
  },
}));

import { findUserByLogin, resolveLogin } from "./loginIdentity";
import { prisma } from "@/lib/prisma";

const findMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  users = [
    { id: "u1", username: "anna", email: "Anna.Keyholder@Example.org" },
    { id: "u2", username: "ben", email: null },
  ];
});

describe("findUserByLogin", () => {
  it("findet über den Benutzernamen", async () => {
    expect((await findUserByLogin("anna"))?.id).toBe("u1");
  });

  it("findet über die E-Mail, ohne Rücksicht auf Gross-/Kleinschreibung und Leerzeichen", async () => {
    expect((await findUserByLogin("  anna.keyholder@EXAMPLE.org ")))?.toMatchObject({ id: "u1" });
  });

  it("der Benutzername hat Vorrang vor der E-Mail eines anderen Kontos", async () => {
    // Ein Benutzername, der zufällig die E-Mail eines ANDEREN Kontos ist, gehört sich selbst.
    users.push({ id: "u3", username: "anna.keyholder@example.org", email: null });
    expect((await findUserByLogin("anna.keyholder@example.org"))?.id).toBe("u3");
    expect(findMany).not.toHaveBeenCalled();
  });

  /** Benutzernamen werden ungetrimmt gespeichert, auf den Instanzen gibt es einen mit Leerzeichen am
   *  Rand. Er muss sich weiter anmelden können — und „ anna" darf nicht zu „anna" werden, wenn es
   *  ein Konto „ anna" gibt. */
  it("ein Benutzername mit Leerzeichen am Rand findet sich weiter so, wie er getippt wird", async () => {
    users.push({ id: "u5", username: " anna", email: null });
    expect((await findUserByLogin(" anna"))?.id).toBe("u5");
    expect((await findUserByLogin("anna"))?.id).toBe("u1");
    // Ohne gepolstertes Gegenstück hilft das Trimmen weiter wie gewollt.
    expect((await findUserByLogin(" ben "))?.id).toBe("u2");
  });

  it("ein Konto ohne E-Mail ist über eine Adresse nicht zu finden", async () => {
    expect(await findUserByLogin("ben@example.org")).toBeNull();
  });

  it("leere Eingabe heisst niemand — ohne Abfrage", async () => {
    expect(await findUserByLogin("")).toBeNull();
    expect(await findUserByLogin("   ")).toBeNull();
    expect(await findUserByLogin(undefined)).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("ohne @ wird nicht über die E-Mail gesucht", async () => {
    expect(await findUserByLogin("unbekannt")).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("passt eine E-Mail auf zwei Konten, ist niemand gemeint — es wird nicht geraten", async () => {
    users.push({ id: "u4", username: "anna2", email: "anna.keyholder@example.org" });
    expect(await findUserByLogin("anna.keyholder@example.org")).toBeNull();
  });
});

describe("resolveLogin — die Fehlversuche zählen am Konto", () => {
  it("Benutzername und E-Mail desselben Kontos führen auf denselben Schlüssel", async () => {
    const perName = await resolveLogin("anna");
    const perMail = await resolveLogin("ANNA.KEYHOLDER@example.org");
    expect(perName).toMatchObject({ identity: "anna", viaEmail: false });
    expect(perMail).toMatchObject({ identity: "anna", viaEmail: true });
  });

  it("eine unbekannte Eingabe zählt unter sich selbst (getrimmt) — wie bisher", async () => {
    expect(await resolveLogin(" niemand@example.org ")).toEqual({ user: null, identity: "niemand@example.org", viaEmail: false });
  });
});
