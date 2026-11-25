export const dynamic = 'force-dynamic';
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

  // Admin cannot write feedback per permission matrix; only HR, Director, CEO
  if (!hasPermission(user.role, PERMISSIONS.CAN_ADD_FEEDBACK)) {
    return NextResponse.json({ error: 'Forbidden: Only interviewers can submit reviews' }, { status: 403 });
  }

  try {
    const { round, rating, recommendation, comments, strengths, concerns, expectedCtc, noticePeriod } =
      await req.json();

    if (!round || !rating || !recommendation || !comments) {
      return NextResponse.json({ error: 'Please provide round, rating, recommendation, and comments' }, { status: 400 });
    }

    if (comments.trim().length < 20) {
      return NextResponse.json(
        { error: 'Review comments must be at least 20 characters long.' },
        { status: 400 }
      );
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: params.id },
    });

    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Create Feedback (FDB-2: interviewerName filled automatically from login)
    const feedback = await prisma.interviewFeedback.create({
      data: {
        candidateId: candidate.id,
        interviewerId: user.id,
        interviewerName: user.name,
        round,
        rating: Number(rating),
        recommendation,
        comments: comments.trim(),
        strengths: strengths?.trim() || null,
        concerns: concerns?.trim() || null,
        expectedCtc: expectedCtc?.trim() || null,
        noticePeriod: noticePeriod?.trim() || null,
      },
    });

    // Update candidate status from recommendation (FDB-7)
    let newStatus = candidate.status;
    if (recommendation === 'Select') {
      newStatus = 'Shortlisted';
    } else if (recommendation === 'Hold') {
      newStatus = 'On Hold';
    } else if (recommendation === 'Reject') {
      newStatus = 'Rejected';
    } else if (recommendation === 'Next round') {
      newStatus = 'Interview Pending';
    }

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { status: newStatus },
    });

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

    // Audit log
    await logAudit({
      userId: user.id,
      userName: user.name,
      action: 'FEEDBACK_ADDED',
      entity: 'InterviewFeedback',
      entityId: feedback.id,
      details: `Added ${round} review for candidate ${candidate.candidateId} with recommendation "${recommendation}" (${rating}/5)`,
      ipAddress: ip,
    });

    // Broadcast SSE
    broadcastEvent({
      type: 'feedback:added',
      payload: {
        candidateId: candidate.candidateId,
        id: candidate.id,
        interviewerName: user.name,
        recommendation,
        status: newStatus,
      },
    });

    return NextResponse.json({ success: true, feedback, updatedStatus: newStatus });
  } catch (error: any) {
    console.error('Feedback submission error:', error);
    return NextResponse.json({ error: error.message || 'Failed to submit feedback' }, { status: 500 });
  }
}

// Edit Review (FDB-4: 15-minute window or dated addendum)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { feedbackId, newComments, isAddendum } = await req.json();

  const feedback = await prisma.interviewFeedback.findUnique({
    where: { id: feedbackId },
  });

  if (!feedback) {
    return NextResponse.json({ error: 'Feedback record not found' }, { status: 404 });
  }

  if (feedback.interviewerId !== user.id && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only the original author can edit this review' }, { status: 403 });
  }

  const now = new Date().getTime();
  const createdTime = new Date(feedback.createdAt).getTime();
  const diffMinutes = (now - createdTime) / (1000 * 60);

  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

  if (diffMinutes <= 15 && !isAddendum) {
    // Within 15 minutes: Direct update permitted with version increment
    await prisma.feedbackVersion.create({
      data: {
        feedbackId: feedback.id,
        versionNumber: feedback.version,
        previousComments: feedback.comments,
        editedById: user.id,
      },
    });

    const updated = await prisma.interviewFeedback.update({
      where: { id: feedback.id },
      data: {
        comments: newComments.trim(),
        version: feedback.version + 1,
        editedAt: new Date(),
      },
    });

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: 'FEEDBACK_EDITED',
      entity: 'InterviewFeedback',
      entityId: feedback.id,
      details: `Edited feedback within 15-min grace period (Version ${feedback.version + 1})`,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true, feedback: updated });
  } else {
    // Beyond 15 minutes: Must be added as a dated addendum
    const addendumText = `\n\n[Addendum by ${user.name} on ${new Date().toLocaleString('en-IN')}]:\n${newComments.trim()}`;
    const combinedComments = feedback.comments + addendumText;

    await prisma.feedbackVersion.create({
      data: {
        feedbackId: feedback.id,
        versionNumber: feedback.version,
        previousComments: feedback.comments,
        editedById: user.id,
      },
    });

    const updated = await prisma.interviewFeedback.update({
      where: { id: feedback.id },
      data: {
        comments: combinedComments,
        version: feedback.version + 1,
        editedAt: new Date(),
      },
    });

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: 'FEEDBACK_ADDENDUM',
      entity: 'InterviewFeedback',
      entityId: feedback.id,
      details: `Appended dated addendum to feedback after 15-min window (Version ${feedback.version + 1})`,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true, feedback: updated, isAddendum: true });
  }
}

// Prohibit review deletion completely (FDB-4: "No one can delete a review, including the Admin")
export async function DELETE() {
  return NextResponse.json(
    {
      error: 'Prohibited: Interview reviews are permanent and tamper-proof. Deletions are forbidden by system policy.',
    },
    { status: 403 }
  );
}
