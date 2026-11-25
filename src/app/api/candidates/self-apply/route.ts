export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { saveUploadedFile, saveBuffer } from '@/lib/storage';
import { mergeImagesToPdf } from '@/lib/pdf-generator';
import { logAudit } from '@/lib/audit';
import { broadcastEvent } from '@/lib/events';

async function generateCandidateId(): Promise<string> {
  const count = await prisma.candidate.count();
  const nextNum = 101 + count;
  return `RM-CAN-${String(nextNum).padStart(6, '0')}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const fullName = formData.get('fullName') as string;
    const mobile = formData.get('mobile') as string;
    const email = formData.get('email') as string;
    const position = formData.get('position') as string;
    const college = formData.get('college') as string;
    const passingYear = formData.get('passingYear') as string;
    const location = formData.get('location') as string;
    const consent = formData.get('consent') === 'true';

    if (!fullName || !mobile || !email || !position) {
      return NextResponse.json({ error: 'Please fill in all mandatory fields.' }, { status: 400 });
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
      return NextResponse.json({ error: 'Candidate consent under the DPDP Act 2023 is required.' }, { status: 400 });
    }

    // Default system user for self-applications (assign to Front Desk or Admin)
    const defaultUploader =
      (await prisma.user.findFirst({ where: { role: 'FRONT_DESK', isActive: true } })) ||
      (await prisma.user.findFirst({ where: { role: 'ADMIN' } }));

    if (!defaultUploader) {
      return NextResponse.json({ error: 'System uploader not configured.' }, { status: 500 });
    }

    const candidateId = await generateCandidateId();

    const academicRemarks = [
      college ? `College: ${college}` : null,
      passingYear ? `Batch/Exp: ${passingYear}` : null,
      location ? `Location: ${location}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    // Create Candidate with status "Pending Verification"
    const candidate = await prisma.candidate.create({
      data: {
        candidateId,
        fullName: fullName.trim(),
        mobile: cleanMobile,
        email: email.toLowerCase().trim(),
        position,
        source: 'Student Self-Apply',
        status: 'New',
        remarks: `[Student Self-Registration] ${academicRemarks}`,
        consentFlag: true,
        uploadedById: defaultUploader.id,
      },
    });

    // Handle resume file or camera capture
    const resumeFile = formData.get('resumeFile') as File | null;
    const cameraPagesJson = formData.get('cameraPages') as string | null;

    if (resumeFile && resumeFile.size > 0) {
      const saved = await saveUploadedFile(resumeFile);
      await prisma.candidateFile.create({
        data: {
          candidateId: candidate.id,
          fileType: 'RESUME',
          storagePath: saved.storagePath,
          fileName: saved.fileName,
          mimeType: saved.mimeType,
          fileSize: saved.fileSize,
          uploadedById: defaultUploader.id,
          virusScanStatus: 'CLEAN',
          fileData: saved.buffer,
        },
      });
    } else if (cameraPagesJson) {
      const pages: { dataUrl: string; pageNumber: number }[] = JSON.parse(cameraPagesJson);
      if (pages.length > 0) {
        const imageBuffers: { buffer: Buffer; mimeType: string }[] = [];
        for (const page of pages) {
          const base64Data = page.dataUrl.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          const mimeType = page.dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
          const savedPage = saveBuffer(buffer, `page-${page.pageNumber}.jpg`, mimeType);
          await prisma.candidateFile.create({
            data: {
              candidateId: candidate.id,
              fileType: 'CAMERA_PAGE',
              storagePath: savedPage.storagePath,
              fileName: `Scanned Page ${page.pageNumber}`,
              mimeType,
              fileSize: savedPage.fileSize,
              pageNumber: page.pageNumber,
              uploadedById: defaultUploader.id,
              fileData: buffer,
            },
          });
          imageBuffers.push({ buffer, mimeType });
        }
        const pdfBuffer = await mergeImagesToPdf(imageBuffers);
        const savedPdf = saveBuffer(pdfBuffer, `${candidateId}-resume.pdf`, 'application/pdf');
        await prisma.candidateFile.create({
          data: {
            candidateId: candidate.id,
            fileType: 'RESUME',
            storagePath: savedPdf.storagePath,
            fileName: `${candidateId}-resume.pdf`,
            mimeType: 'application/pdf',
            fileSize: savedPdf.fileSize,
            uploadedById: defaultUploader.id,
            fileData: pdfBuffer,
          },
        });
      }
    }

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

    // Audit log
    await logAudit({
      userId: null,
      userName: `Candidate (${candidate.fullName})`,
      action: 'CANDIDATE_INTAKE',
      entity: 'Candidate',
      entityId: candidate.id,
      details: `Self-registered candidate ${candidate.candidateId} (${candidate.fullName}) for ${candidate.position}`,
      ipAddress: ip,
    });

    // Notify Front Desk & HR
    const notifyUsers = await prisma.user.findMany({
      where: { role: { in: ['FRONT_DESK', 'HR'] }, isActive: true },
      select: { id: true },
    });

    for (const u of notifyUsers) {
      await prisma.notification.create({
        data: {
          userId: u.id,
          candidateId: candidate.id,
          title: 'Walk-in Student Checked In',
          message: `${candidate.fullName} has self-registered for ${candidate.position}. Ready for verification.`,
          type: 'NEW_CANDIDATE',
        },
      });
    }

    // Broadcast SSE
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
    });

    return NextResponse.json({
      success: true,
      candidate: {
        id: candidate.id,
        candidateId: candidate.candidateId,
        fullName: candidate.fullName,
        position: candidate.position,
      },
    });
  } catch (error: any) {
    console.error('Self apply error:', error);
    return NextResponse.json({ error: error.message || 'Failed to submit application' }, { status: 500 });
  }
}
