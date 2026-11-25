export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { PERMISSIONS, hasPermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';

export async function GET() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.role, PERMISSIONS.CAN_MANAGE_ADMIN)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [settings, masterLists] = await Promise.all([
    prisma.systemSetting.findMany(),
    prisma.masterList.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);

  return NextResponse.json({ settings, masterLists });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.role, PERMISSIONS.CAN_MANAGE_ADMIN)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { settings, newMasterItem } = await req.json();

    if (settings && Array.isArray(settings)) {
      for (const s of settings) {
        await prisma.systemSetting.upsert({
          where: { key: s.key },
          update: { value: s.value },
          create: { key: s.key, value: s.value },
        });
      }
    }

    if (newMasterItem && newMasterItem.category && newMasterItem.label) {
      await prisma.masterList.create({
        data: {
          category: newMasterItem.category,
          label: newMasterItem.label.trim(),
          value: newMasterItem.label.trim(),
        },
      });
    }

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    await logAudit({
      userId: user.id,
      userName: user.name,
      action: 'SETTINGS_CHANGED',
      entity: 'SystemSetting',
      details: 'Updated system settings or master list items',
      ipAddress: ip,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update settings' }, { status: 500 });
  }
}
