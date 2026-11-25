import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'reapmind-hr-super-secret-jwt-key-2026-kolhapur-secure'
);

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/apply', '/api/candidates/self-apply', '/images'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static files, next internals, and public endpoints
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('reapmind_session')?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized: Session missing' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const session = payload as { role?: string; lastActive?: number };

    // Inactivity timeout: 30 minutes
    const thirtyMinutesMs = 30 * 60 * 1000;
    if (session.lastActive && Date.now() - session.lastActive > thirtyMinutesMs) {
      const response = NextResponse.redirect(new URL('/login?expired=1', req.url));
      response.cookies.delete('reapmind_session');
      return response;
    }

    // Role-based protection for /admin routes
    if (pathname.startsWith('/admin') && session.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard?error=forbidden', req.url));
    }

    return NextResponse.next();
  } catch (error) {
    const response = NextResponse.redirect(new URL('/login?expired=1', req.url));
    response.cookies.delete('reapmind_session');
    return response;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
