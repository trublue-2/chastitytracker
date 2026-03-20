import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

function ts() { return new Date().toISOString(); }

// In-memory rate limiting: max 5 failures per username, 15 min lockout
const loginAttempts = new Map<string, { failures: number; blockedUntil: Date | null }>();

function checkRateLimit(username: string): boolean {
  const entry = loginAttempts.get(username);
  if (!entry) return true;
  if (entry.blockedUntil && entry.blockedUntil > new Date()) return false;
  return true;
}

function recordFailure(username: string) {
  const entry = loginAttempts.get(username) ?? { failures: 0, blockedUntil: null };
  entry.failures += 1;
  if (entry.failures >= 5) {
    entry.blockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    console.warn(`${ts()} [auth] Login für "${username}" für 15 min gesperrt (zu viele Fehlversuche)`);
  }
  loginAttempts.set(username, entry);
}

function recordSuccess(username: string) {
  loginAttempts.delete(username);
}

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
      },
      async authorize(credentials) {
        const username = credentials?.username as string;
        const password = credentials?.password as string;

        if (!checkRateLimit(username)) return null;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
          recordFailure(username);
          console.warn(`${ts()} [auth] Fehlgeschlagener Login-Versuch für "${username}" (unbekannter Benutzer)`);
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          recordFailure(username);
          console.warn(`${ts()} [auth] Fehlgeschlagener Login-Versuch für "${username}" (falsches Passwort)`);
          return null;
        }

        recordSuccess(username);
        return { id: user.id, name: user.username, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
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
