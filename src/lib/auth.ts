import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

import { checkRateLimit, recordFailure, recordSuccess } from "@/lib/login-attempts";
import { resolveLogin } from "@/lib/loginIdentity";
import { consumePasskeyToken } from "@/lib/webauthn";
import { controlsAnySub } from "@/lib/keyholder";

function ts() { return new Date().toISOString(); }

/**
 * Ein gültiger bcrypt-Hash mit demselben Kostenfaktor (12) wie jedes Passwort — Klartext unbekannt
 * und belanglos. Gegen ihn wird bei einer UNBEKANNTEN Eingabe verglichen, damit die Antwort genauso
 * lange dauert wie bei einem bekannten Konto mit falschem Passwort. Ohne ihn verriet die Antwortzeit,
 * ob es ein Konto gibt: nur bekannte Konten bezahlten die bcrypt-Runde.
 */
const TIMING_DUMMY_HASH = "$2b$12$yo6EiJgrWUYaoGKVbtyJvORsOdH40mvgcmp1yRZkAXzLZvB7RdtHu";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  logger: {
    error(error) {
      const e = error as { name?: string; type?: string };
      if (e.name === "CredentialsSignin" || e.type === "CredentialsSignin") return;
      console.error(ts(), "[auth][error]", error);
    },
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Benutzername oder E-Mail", type: "text" },
        password: { label: "Passwort", type: "password" },
        passkeyToken: { label: "Passkey Token", type: "text" },
      },
      async authorize(credentials) {
        const passkeyToken = credentials?.passkeyToken as string | undefined;

        // ── Passkey token flow (from WebAuthn authenticate endpoint) ──
        if (passkeyToken) {
          const userId = consumePasskeyToken(passkeyToken);
          if (!userId) {
            console.warn(`${ts()} [auth] Passkey-Token ungültig oder abgelaufen`);
            return null;
          }
          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (!user) return null;
          console.log(`${ts()} [auth] Passkey-Login für "${user.username}"`);
          return { id: user.id, name: user.username, role: user.role, timezone: user.timezone, locale: user.locale };
        }

        // ── Standard credentials flow ──
        // Im Feld steht Benutzername ODER E-Mail (`findUserByLogin`). Aufgelöst wird VOR dem
        // Rate-Limit: die Fehlversuche zählen am Konto, nicht an der Schreibweise.
        const identifier = (credentials?.username as string | undefined) ?? "";
        const password = (credentials?.password as string | undefined) ?? "";

        const { user, identity, viaEmail } = await resolveLogin(identifier);
        if (!await checkRateLimit(identity)) return null;

        // Im Log der Benutzername, sobald er feststeht — mit dem Hinweis, wenn über die E-Mail
        // angemeldet wurde. Unbekannte Eingaben erscheinen weiter so, wie sie eingegeben wurden.
        const who = `"${identity}"${viaEmail ? " (über E-Mail)" : ""}`;

        if (!user) {
          await bcrypt.compare(password, TIMING_DUMMY_HASH);
          await recordFailure(identity);
          console.warn(`${ts()} [auth] Fehlgeschlagener Login-Versuch für ${who} (unbekannter Benutzer)`);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await recordFailure(identity);
          console.warn(`${ts()} [auth] Fehlgeschlagener Login-Versuch für ${who} (falsches Passwort)`);
          return null;
        }

        await recordSuccess(identity);
        return { id: user.id, name: user.username, role: user.role, timezone: user.timezone, locale: user.locale };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.timezone = (user as { timezone?: string }).timezone;
        token.locale = (user as { locale?: string }).locale;
        token.roleCheckedAt = Date.now();
        token.controlsSubs = await controlsAnySub(user.id as string);
      } else if (token.id) {
        // Re-fetch role from DB at most every 5 minutes to detect demotions/deletions.
        // Full re-check on every request caused 1–2 unnecessary DB hits per navigation.
        // Trade-off: a deleted or demoted user retains a valid session for up to 5 minutes.
        // Acceptable for this use-case — no financial or safety implications.
        const RECHECK_MS = 5 * 60 * 1000;
        const checkedAt = (token.roleCheckedAt as number) ?? 0;
        if (Date.now() - checkedAt > RECHECK_MS) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, timezone: true, locale: true },
          });
          if (!dbUser) return null; // user deleted — NextAuth clears the session cookie
          token.role = dbUser.role;
          token.timezone = dbUser.timezone;
          token.locale = dbUser.locale;
          token.roleCheckedAt = Date.now();
          token.controlsSubs = await controlsAnySub(token.id as string);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as { id: string; name?: string | null; role?: string }).role =
          token.role as string;
        (session.user as { controlsSubs?: boolean }).controlsSubs =
          token.controlsSubs as boolean | undefined;
        (session.user as { timezone?: string }).timezone =
          token.timezone as string | undefined;
        (session.user as { locale?: string }).locale =
          token.locale as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
