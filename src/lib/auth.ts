import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from './prisma';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'reapmind-hr-super-secret-jwt-key-2026-kolhapur-secure'
);

export const COOKIE_NAME = 'reapmind_session';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: string;
  lastActive: number;
}

export async function createSessionToken(payload: Omit<UserSession, 'lastActive'>): Promise<string> {
  return await new SignJWT({
    ...payload,
    lastActive: Date.now(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const session = payload as unknown as UserSession;

    // Check 30-minute inactivity timeout (AUTH-4: Automatic logout after 30 minutes of inactivity)
    const thirtyMinutesMs = 30 * 60 * 1000;
    if (session.lastActive && Date.now() - session.lastActive > thirtyMinutesMs) {
      return null; // Expired due to inactivity
    }

    return session;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<UserSession | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  // Verify user is still active in DB
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    lastActive: Date.now(),
  };
}
