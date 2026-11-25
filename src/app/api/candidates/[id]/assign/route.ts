import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { PERMISSIONS, hasPermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { broadcastEvent } from '@/lib/events';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check Front Desk setting if front desk
  if (user.role === 'FRONT_DESK') {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'FRONT_DESK_ASSIGNMENT_ALLOWED' },
    });
    if (setting?.value !== 'true') {
      return NextResponse.json({ error: 'Front Desk is not permitted to assign candidates.' }, { status: 403 });
    }
  } else if (!hasPermission(user.role, PERMISSIONS.CAN_ASSIGN)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { assignedToId, round, interviewDatetime } = await req.json();

    const candidate = await prisma.candidate.findUnique({
      where: { id: params.id },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    let assignedUser = null;
    if (assignedToId) {
      assignedUser = await prisma.user.findUnique({
        where: { id: assignedToId },
      });
      if (!assignedUser) {
        return NextResponse.json({ error: 'Interviewer not found' }, { status: 404 });
      }
    }

    // Update candidate
    const updatedCandidate = await prisma.candidate.update({
      where: { id: params.id },
      data: {
        assignedToId: assignedToId || null,
        status: assignedToId ? (candidate.status === 'New' ? 'Assigned' : candidate.status) : 'New',
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    // Record assignment history
    if (assignedToId && assignedUser) {
      await prisma.assignment.create({
        data: {
          candidateId: candidate.id,
          assignedToId: assignedUser.id,
          assignedById: user.id,
          round: round || 'Screening',
          interviewDatetime: interviewDatetime ? new Date(interviewDatetime) : null,
        },
      });

      // In-app notification to the assigned interviewer (VIS-3)
      await prisma.notification.create({
        data: {
          userId: assignedUser.id,
          candidateId: candidate.id,
          title: 'Candidate Assigned to You',
          message: `${candidate.fullName} has been assigned to you for ${round || 'Screening'}.`,
          type: 'ASSIGNED',
        },
      });
    }

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

    // Audit log
    await logAudit({
      userId: user.id,
      userName: user.name,
      action: 'ASSIGNMENT',
      entity: 'Candidate',
      entityId: candidate.id,
      details: assignedUser
        ? `Assigned candidate ${candidate.candidateId} to ${assignedUser.name}`
        : `Unassigned candidate ${candidate.candidateId}`,
      ipAddress: ip,
    });

    // Broadcast SSE
    broadcastEvent({
      type: 'candidate:assigned',
      payload: {
        candidateId: candidate.candidateId,
        id: candidate.id,
        assignedTo: assignedUser ? { id: assignedUser.id, name: assignedUser.name } : null,
        status: updatedCandidate.status,
      },
    });

    return NextResponse.json({ success: true, candidate: updatedCandidate });
  } catch (error: any) {
    console.error('Assignment error:', error);
    return NextResponse.json({ error: error.message || 'Failed to assign candidate' }, { status: 500 });
  }
}
