import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, COOKIE_NAME } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (user) {
      const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
      await logAudit({
        userId: user.id,
        userName: user.name,
        action: 'LOGOUT',
        entity: 'User',
        entityId: user.id,
        details: 'User logged out',
        ipAddress: ip,
      });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete(COOKIE_NAME);
    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
