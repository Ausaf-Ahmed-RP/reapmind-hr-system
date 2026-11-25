export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { PERMISSIONS, hasPermission } from '@/lib/rbac';
import { saveUploadedFile, saveBuffer } from '@/lib/storage';
import { mergeImagesToPdf } from '@/lib/pdf-generator';
import { logAudit } from '@/lib/audit';
import { broadcastEvent } from '@/lib/events';

// Generate sequential candidate ID: RM-CAN-000101
async function generateCandidateId(): Promise<string> {
  const count = await prisma.candidate.count();
  const nextNum = 101 + count;
  return `RM-CAN-${String(nextNum).padStart(6, '0')}`;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search')?.trim() || '';
  const status = searchParams.get('status') || '';
  const position = searchParams.get('position') || '';
  const source = searchParams.get('source') || '';
  const assignedToId = searchParams.get('assignedToId') || '';
  const unassigned = searchParams.get('unassigned') === 'true';
  const myCandidates = searchParams.get('myCandidates') === 'true';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '25');

  const where: any = {};

  // Front desk can ONLY see candidates they uploaded (Section 5 Permission Matrix)
  if (user.role === 'FRONT_DESK') {
    where.uploadedById = user.id;
  } else {
    // Quick filters
    if (unassigned) {
      where.assignedToId = null;
    } else if (assignedToId) {
      where.assignedToId = assignedToId;
    }

    if (myCandidates) {
      where.assignedToId = user.id;
    }
  }

  if (status) {
    where.status = status;
  }
  if (position) {
    where.position = position;
  }
  if (source) {
    where.source = source;
  }

  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { mobile: { contains: search } },
      { email: { contains: search } },
      { candidateId: { contains: search } },
    ];
  }

  const [total, candidates] = await Promise.all([
    prisma.candidate.count({ where }),
    prisma.candidate.findMany({
      where,
      include: {
        uploadedBy: { select: { id: true, name: true, email: true, role: true } },
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        files: true,
        _count: { select: { feedbacks: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    candidates,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasPermission(user.role, PERMISSIONS.CAN_ADD_CANDIDATE)) {
    return NextResponse.json({ error: 'Forbidden: Cannot add candidates' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const fullName = formData.get('fullName') as string;
    const mobile = formData.get('mobile') as string;
    const email = formData.get('email') as string;
    const position = formData.get('position') as string;
    const source = formData.get('source') as string;
    const remarks = formData.get('remarks') as string;
    const consent = formData.get('consent') === 'true';
    const ignoreDuplicate = formData.get('ignoreDuplicate') === 'true';
    const duplicateReason = formData.get('duplicateReason') as string;

    // Validation INT-1, INT-4
    if (!fullName || !mobile || !email || !position || !source) {
      return NextResponse.json({ error: 'Please fill all required fields.' }, { status: 400 });
    }

    const cleanMobile = mobile.trim().replace(/\D/g, '').slice(-10);
    if (cleanMobile.length !== 10) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit Indian mobile number.' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (!consent) {
      return NextResponse.json({ error: 'Candidate consent under DPDP Act 2023 is mandatory.' }, { status: 400 });
    }

    // Duplicate Check INT-7
    if (!ignoreDuplicate) {
      const existing = await prisma.candidate.findFirst({
        where: {
          OR: [{ mobile: { contains: cleanMobile } }, { email: email.toLowerCase().trim() }],
        },
      });

      if (existing) {
        return NextResponse.json(
          {
            duplicateFound: true,
            existingCandidateId: existing.candidateId,
            existingName: existing.fullName,
            message: `Candidate already exists with this mobile/email (${existing.candidateId} - ${existing.fullName}).`,
          },
          { status: 409 }
        );
      }
    }

    const candidateId = await generateCandidateId();

    // Create Candidate
    const candidate = await prisma.candidate.create({
      data: {
        candidateId,
        fullName: fullName.trim(),
        mobile: cleanMobile,
        email: email.toLowerCase().trim(),
        position,
        source,
        remarks: duplicateReason ? `[Re-application reason: ${duplicateReason}] ${remarks || ''}` : remarks,
        consentFlag: true,
        status: 'New',
        uploadedById: user.id,
      },
    });

    // Handle File Intake: either direct file or camera pages
    const resumeFile = formData.get('resumeFile') as File | null;
    const cameraPagesJson = formData.get('cameraPages') as string | null;

    if (resumeFile && resumeFile.size > 0) {
      // Validate file size (10 MB)
      if (resumeFile.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Resume file size exceeds the 10 MB limit.' }, { status: 400 });
      }

      const saved = await saveUploadedFile(resumeFile);
      await prisma.candidateFile.create({
        data: {
          candidateId: candidate.id,
          fileType: 'RESUME',
          storagePath: saved.storagePath,
          fileName: saved.fileName,
          mimeType: saved.mimeType,
          fileSize: saved.fileSize,
          uploadedById: user.id,
          virusScanStatus: 'CLEAN',
          fileData: saved.buffer,
        },
      });
    }

    if (cameraPagesJson) {
      // Handle multi-page camera scan INT-3
      const pages: { dataUrl: string; pageNumber: number }[] = JSON.parse(cameraPagesJson);

      if (pages.length > 0) {
        const imageBuffers: { buffer: Buffer; mimeType: string }[] = [];

        // Save individual camera pages and collect buffers
        for (const page of pages) {
          const base64Data = page.dataUrl.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          const mimeType = page.dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

          // Save original camera image
          const savedPage = saveBuffer(buffer, `snapshot-page-${page.pageNumber}.jpg`, mimeType);
          await prisma.candidateFile.create({
            data: {
              candidateId: candidate.id,
              fileType: 'CAMERA_PAGE',
              storagePath: savedPage.storagePath,
              fileName: `Camera Snapshot Page ${page.pageNumber}`,
              mimeType,
              fileSize: savedPage.fileSize,
              pageNumber: page.pageNumber,
              uploadedById: user.id,
              virusScanStatus: 'CLEAN',
              fileData: buffer,
            },
          });

          imageBuffers.push({ buffer, mimeType });
        }

        // Combine into one PDF
        const pdfBuffer = await mergeImagesToPdf(imageBuffers);
        const savedPdf = saveBuffer(pdfBuffer, `${candidateId}-scanned-resume.pdf`, 'application/pdf');

        await prisma.candidateFile.create({
          data: {
            candidateId: candidate.id,
            fileType: 'SCANNED_DOC',
            storagePath: savedPdf.storagePath,
            fileName: `${candidateId}-scanned-resume.pdf`,
            mimeType: 'application/pdf',
            fileSize: savedPdf.fileSize,
            uploadedById: user.id,
            virusScanStatus: 'CLEAN',
            fileData: pdfBuffer,
          },
        });
      }
    }

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

    // Audit Log
    await logAudit({
      userId: user.id,
      userName: user.name,
      action: 'CANDIDATE_INTAKE',
      entity: 'Candidate',
      entityId: candidate.id,
      details: `Added new candidate ${candidate.candidateId} (${candidate.fullName}) for ${candidate.position}`,
      ipAddress: ip,
    });

    // Notify HR, Directors, and CEO (VIS-2)
    const leadershipUsers = await prisma.user.findMany({
      where: { role: { in: ['HR', 'DIRECTOR', 'CEO'] }, isActive: true },
      select: { id: true },
    });

    for (const lead of leadershipUsers) {
      await prisma.notification.create({
        data: {
          userId: lead.id,
          candidateId: candidate.id,
          title: 'New Candidate Registered',
          message: `${candidate.fullName} has applied for ${candidate.position} via ${candidate.source}.`,
          type: 'NEW_CANDIDATE',
        },
      });
    }

    // Broadcast Real-time event (VIS-1: within 10 seconds without refreshing)
    broadcastEvent({
      type: 'candidate:created',
      payload: {
        candidateId: candidate.candidateId,
        id: candidate.id,
        fullName: candidate.fullName,
        position: candidate.position,
        source: candidate.source,
        status: candidate.status,
        createdAt: candidate.createdAt,
      },
      targetRoles: ['HR', 'DIRECTOR', 'CEO', 'ADMIN'],
    });

    return NextResponse.json({
      success: true,
      candidate: {
        id: candidate.id,
        candidateId: candidate.candidateId,
        fullName: candidate.fullName,
        position: candidate.position,
        status: candidate.status,
      },
    });
  } catch (error: any) {
    console.error('Candidate intake error:', error);
    return NextResponse.json({ error: error.message || 'Failed to save candidate' }, { status: 500 });
  }
}
