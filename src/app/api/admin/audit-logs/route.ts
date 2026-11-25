import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { PERMISSIONS, hasPermission } from '@/lib/rbac';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.role, PERMISSIONS.CAN_MANAGE_ADMIN)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const search = searchParams.get('search')?.trim();
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  const where: any = {};
  if (action) where.action = action;
  if (search) {
    where.OR = [
      { details: { contains: search } },
      { userName: { contains: search } },
      { entity: { contains: search } },
      { ipAddress: { contains: search } },
    ];
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
