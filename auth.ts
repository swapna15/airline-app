import NextAuth from 'next-auth';
import type { User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { SignJWT, jwtVerify } from 'jose';
import { roleFromEmail } from '@/types/roles';
import type { UserRole } from '@/types/roles';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // If backend is deployed, validate against the real users Lambda
        if (API_URL) {
          try {
            const res = await fetch(`${API_URL}/users/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: credentials.email, password: credentials.password }),
            });
            if (!res.ok) return null;
            const user = await res.json() as { id: string; name: string; email: string; role: string };
            return { id: user.id, name: user.name, email: user.email, role: user.role as UserRole } as User;
          } catch {
            return null;
          }
        }

        // Local dev fallback: derive role from email prefix
        const role = roleFromEmail(credentials.email);
        return {
          id: 'local-' + credentials.email,
          name: credentials.email.split('@')[0],
          email: credentials.email,
          role,
        } as User;
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' as const },
  secret: process.env.NEXTAUTH_SECRET,
  // Override the default A256GCM JWE encoding with HS256 signing so the API
  // Gateway authorizer Lambda — which uses jsonwebtoken.verify(token, secret)
  // — can validate the same cookie. Without this, every authed bridge call
  // 401s because jsonwebtoken cannot read encrypted JWE tokens.
  jwt: {
    async encode({ token, secret, maxAge }: { token?: JWT; secret: string | Buffer; maxAge?: number }) {
      const key = new TextEncoder().encode(typeof secret === 'string' ? secret : secret.toString());
      const exp = Math.floor(Date.now() / 1000) + (maxAge ?? 30 * 24 * 60 * 60);
      return await new SignJWT({ ...(token ?? {}) })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(key);
    },
    async decode({ token, secret }: { token?: string; secret: string | Buffer }) {
      if (!token) return null;
      try {
        const key = new TextEncoder().encode(typeof secret === 'string' ? secret : secret.toString());
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
        return payload as JWT;
      } catch {
        return null;
      }
    },
  },
  callbacks: {
    async jwt({ token, user }: { token: any; user: any }) {
      if (user?.role) token.role = user.role;
      if (!token.role && token.email) token.role = roleFromEmail(token.email);
      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      if (session.user) session.user.role = token.role ?? 'passenger';
      return session;
    },
  },
};

export default NextAuth(authOptions);
