import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { PERMISSIONS, hasPermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: params.id },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true, role: true } },
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
      files: {
        orderBy: [{ fileType: 'desc' }, { pageNumber: 'asc' }],
      },
      assignments: {
        include: {
          assignedTo: { select: { id: true, name: true, role: true } },
          assignedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: { assignedAt: 'desc' },
      },
      feedbacks: {
        include: {
          interviewer: { select: { id: true, name: true, role: true } },
          versions: {
            orderBy: { editedAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }

  // Front desk permission check (Section 5 Permission Matrix)
  if (user.role === 'FRONT_DESK') {
    if (candidate.uploadedById !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Front Desk CANNOT see interview feedback (FDB-5)
    const { feedbacks, assignments, ...safeCandidate } = candidate;
    return NextResponse.json({
      candidate: {
        ...safeCandidate,
        feedbacks: [],
        assignments: [],
      },
    });
  }

  // Log view activity (PRO-3, ADM-5)
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  await logAudit({
    userId: user.id,
    userName: user.name,
    action: 'RESUME_VIEW',
    entity: 'Candidate',
    entityId: candidate.id,
    details: `Viewed profile of candidate ${candidate.candidateId} (${candidate.fullName})`,
    ipAddress: ip,
  });

  return NextResponse.json({ candidate });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasPermission(user.role, PERMISSIONS.CAN_CHANGE_STATUS)) {
    return NextResponse.json({ error: 'Forbidden: Cannot change status' }, { status: 403 });
  }

  const { status, remarks } = await req.json();

  const current = await prisma.candidate.findUnique({
    where: { id: params.id },
  });

  if (!current) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }

  const updated = await prisma.candidate.update({
    where: { id: params.id },
    data: {
      status: status || current.status,
      remarks: remarks !== undefined ? remarks : current.remarks,
    },
  });

  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  await logAudit({
    userId: user.id,
    userName: user.name,
    action: 'STATUS_CHANGED',
    entity: 'Candidate',
    entityId: current.id,
    details: `Changed status from "${current.status}" to "${status}" for candidate ${current.candidateId}`,
    ipAddress: ip,
  });

  return NextResponse.json({ success: true, candidate: updated });
}
