import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

import { checkRateLimit, recordFailure, recordSuccess } from "@/lib/login-attempts";
import { consumePasskeyToken } from "@/app/api/auth/passkey/authenticate/route";

function ts() { return new Date().toISOString(); }

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
        username: { label: "Benutzername", type: "text" },
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
          return { id: user.id, name: user.username, role: user.role };
        }

        // ── Standard credentials flow ──
        const username = credentials?.username as string;
        const password = credentials?.password as string;

        if (!await checkRateLimit(username)) return null;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
          await recordFailure(username);
          console.warn(`${ts()} [auth] Fehlgeschlagener Login-Versuch für "${username}" (unbekannter Benutzer)`);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await recordFailure(username);
          console.warn(`${ts()} [auth] Fehlgeschlagener Login-Versuch für "${username}" (falsches Passwort)`);
          return null;
        }

        await recordSuccess(username);
        return { id: user.id, name: user.username, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      } else if (token.id) {
        // Re-fetch role from DB on every token refresh to detect demotions/deletions
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true },
        });
        if (!dbUser) return { ...token, id: null, role: null }; // user deleted
        token.role = dbUser.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as { id: string; name?: string | null; role?: string }).role =
          token.role as string;
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
