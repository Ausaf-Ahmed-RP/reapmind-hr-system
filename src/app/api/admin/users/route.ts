import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { PERMISSIONS, hasPermission } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';

export async function GET() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.role, PERMISSIONS.CAN_MANAGE_ADMIN)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      mobile: true,
      isActive: true,
      lastLogin: true,
      createdAt: true,
      _count: { select: { feedbacks: true, uploadedCandidates: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.role, PERMISSIONS.CAN_MANAGE_ADMIN)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { name, email, role, password, mobile } = await req.json();

    if (!name || !email || !role || !password) {
      return NextResponse.json({ error: 'Name, email, role, and password are required' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role,
        mobile: mobile?.trim() || null,
        passwordHash,
        isActive: true,
      },
    });

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    await logAudit({
      userId: user.id,
      userName: user.name,
      action: 'USER_MANAGED',
      entity: 'User',
      entityId: newUser.id,
      details: `Created new user "${newUser.name}" with role "${newUser.role}"`,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true, user: newUser });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create user' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.role, PERMISSIONS.CAN_MANAGE_ADMIN)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { userId, role, isActive, password } = await req.json();

    const data: any = {};
    if (role) data.role = role;
    if (isActive !== undefined) data.isActive = isActive;
    if (password) data.passwordHash = await bcrypt.hash(password, 10);

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
    });

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    await logAudit({
      userId: user.id,
      userName: user.name,
      action: 'USER_MANAGED',
      entity: 'User',
      entityId: updated.id,
      details: `Updated user "${updated.name}" (Role: ${updated.role}, Active: ${updated.isActive})`,
      ipAddress: ip,
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update user' }, { status: 500 });
  }
}
