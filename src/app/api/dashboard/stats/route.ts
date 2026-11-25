export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Calculate start of today in local time
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const baseWhere: any = {};
  if (user.role === 'FRONT_DESK') {
    baseWhere.uploadedById = user.id;
  }

  const [
    totalCandidates,
    newToday,
    unassigned,
    interviewPending,
    interviewed,
    shortlisted,
    onHold,
    rejected,
  ] = await Promise.all([
    prisma.candidate.count({ where: baseWhere }),
    prisma.candidate.count({
      where: {
        ...baseWhere,
        createdAt: { gte: startOfToday },
      },
    }),
    prisma.candidate.count({
      where: {
        ...baseWhere,
        assignedToId: null,
      },
    }),
    prisma.candidate.count({
      where: {
        ...baseWhere,
        status: { in: ['Assigned', 'Interview Pending'] },
      },
    }),
    prisma.candidate.count({
      where: {
        ...baseWhere,
        status: 'Interviewed',
      },
    }),
    prisma.candidate.count({
      where: {
        ...baseWhere,
        status: 'Shortlisted',
      },
    }),
    prisma.candidate.count({
      where: {
        ...baseWhere,
        status: 'On Hold',
      },
    }),
    prisma.candidate.count({
      where: {
        ...baseWhere,
        status: 'Rejected',
      },
    }),
  ]);

  return NextResponse.json({
    totalCandidates,
    newToday,
    unassigned,
    interviewPending,
    interviewed,
    shortlisted,
    onHold,
    rejected,
  });
}
