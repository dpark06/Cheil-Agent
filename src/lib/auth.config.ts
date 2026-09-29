import type { NextAuthConfig } from "next-auth";

// Edge-safe subset of the auth config: no Prisma adapter, no bcrypt-based
// Credentials.authorize. Used by middleware (which runs on the Edge runtime).
// The full config with Credentials + Prisma lives in auth.ts (Node runtime only).
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
