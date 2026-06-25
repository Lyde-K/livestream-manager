import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { resolvePermissions } from "@/lib/permissions";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });
        if (!user) return null;
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!valid) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { id: user.id, email: user.email, name: user.name, role: user.role } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = user.id;
        if ((user as { role: string }).role === "LIVE_HOST") {
          const liveHost = await prisma.liveHost.findUnique({
            where: { userId: user.id as string },
            select: { type: true, permissions: true },
          });
          if (liveHost) {
            token.hostType = liveHost.type;
            token.hostPermissions = resolvePermissions(
              liveHost.type,
              (liveHost.permissions as Record<string, boolean>) ?? {}
            );
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).role = token.role as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).id = token.id as string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).hostType = token.hostType as string | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session.user as any).hostPermissions = token.hostPermissions;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days
});
