import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth: session }) {
      // Called by middleware — return true to allow, false to redirect to /login
      return !!session?.user;
    },
    signIn({ user }) {
      const allowed = process.env.ALLOWED_EMAIL?.trim();
      return !allowed || user.email === allowed;
    },
  },
});
