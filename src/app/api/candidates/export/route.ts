import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { PERMISSIONS, hasPermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasPermission(user.role, PERMISSIONS.CAN_EXPORT_REPORTS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const candidates = await prisma.candidate.findMany({
    include: {
      uploadedBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      _count: { select: { feedbacks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  await logAudit({
    userId: user.id,
    userName: user.name,
    action: 'EXPORT_REPORTS',
    entity: 'Candidate',
    details: `Exported ${candidates.length} candidates to CSV`,
    ipAddress: ip,
  });

  // Construct CSV
  const header = ['ID', 'Candidate Name', 'Mobile', 'Email', 'Position', 'Source', 'Status', 'Uploaded By', 'Assigned To', 'Created Date'];
  const rows = candidates.map((c) => [
    c.candidateId,
    `"${c.fullName.replace(/"/g, '""')}"`,
    c.mobile,
    c.email,
    `"${c.position.replace(/"/g, '""')}"`,
    c.source,
    c.status,
    `"${c.uploadedBy?.name || ''}"`,
    `"${c.assignedTo?.name || 'Unassigned'}"`,
    new Date(c.createdAt).toLocaleDateString('en-IN'),
  ]);

  const csvContent = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="reapmind-candidates-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
