export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { getAbsoluteFilePath } from '@/lib/storage';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { fileId: string } }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const file = await prisma.candidateFile.findUnique({
    where: { id: params.fileId },
    include: { candidate: true },
  });

  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // Front Desk can only view files for candidates they uploaded
  if (user.role === 'FRONT_DESK' && file.candidate.uploadedById !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const filePath = getAbsoluteFilePath(file.storagePath);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File content missing on server' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const isDownload = searchParams.get('download') === 'true';

  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';

  // Audit log views and downloads (PRO-4, ADM-5)
  await logAudit({
    userId: user.id,
    userName: user.name,
    action: isDownload ? 'RESUME_DOWNLOAD' : 'RESUME_VIEW',
    entity: 'CandidateFile',
    entityId: file.id,
    details: `${isDownload ? 'Downloaded' : 'Viewed'} file "${file.fileName}" for candidate ${file.candidate.candidateId}`,
    ipAddress: ip,
  });

  const fileBuffer = fs.readFileSync(filePath);

  const headers = new Headers();
  headers.set('Content-Type', file.mimeType);
  headers.set('Content-Length', fileBuffer.length.toString());

  if (isDownload) {
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
  } else {
    headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
  }

  return new NextResponse(fileBuffer, { headers });
}
