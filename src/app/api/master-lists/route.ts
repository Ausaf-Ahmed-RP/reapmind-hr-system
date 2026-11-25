import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');

  const where: any = { isActive: true };
  if (category) {
    where.category = category;
  }

  const items = await prisma.masterList.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
  });

  // Also fetch list of interviewers (HR, Director, CEO) for the assignment dropdown
  const interviewers = await prisma.user.findMany({
    where: {
      role: { in: ['HR', 'DIRECTOR', 'CEO'] },
      isActive: true,
    },
    select: { id: true, name: true, role: true, email: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    items,
    interviewers,
  });
}
