const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding ReapMind HR Operations Database...');

  // 1. Initial users
  const defaultPassword = await bcrypt.hash('Password@123', 10);

  const users = [
    { name: 'Front Desk Executive', email: 'frontdesk@reapmind.com', role: 'FRONT_DESK', mobile: '9876543210' },
    { name: 'Aayushi', email: 'aayushi@reapmind.com', role: 'HR', mobile: '9876543211' },
    { name: 'Hema', email: 'hema@reapmind.com', role: 'HR', mobile: '9876543212' },
    { name: 'Mahwash', email: 'mahwash@reapmind.com', role: 'HR', mobile: '9876543213' },
    { name: 'HR Lead', email: 'hrlead@reapmind.com', role: 'HR', mobile: '9876543214' },
    { name: 'Aroof (Director)', email: 'aroof@reapmind.com', role: 'DIRECTOR', mobile: '9876543215' },
    { name: 'CEO', email: 'ceo@reapmind.com', role: 'CEO', mobile: '9876543216' },
    { name: 'System Admin', email: 'admin@reapmind.com', role: 'ADMIN', mobile: '9876543217' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, name: u.name },
      create: {
        name: u.name,
        email: u.email,
        role: u.role,
        mobile: u.mobile,
        passwordHash: defaultPassword,
        isActive: true,
        forcePasswordChange: false,
      },
    });
  }

  // 2. Master Lists
  const positions = [
    'Full Stack Developer',
    'Frontend Developer',
    'Backend Developer',
    'React Native Developer',
    'DevOps Engineer',
    'QA Automation Engineer',
    'UI/UX Designer',
    'HR Operations Executive',
  ];
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    await prisma.masterList.create({
      data: { category: 'POSITION', label: p, value: p, sortOrder: i },
    });
  }

  const sources = ['Walk-in', 'Referral', 'Job portal', 'Consultant', 'Other'];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    await prisma.masterList.create({
      data: { category: 'SOURCE', label: s, value: s, sortOrder: i },
    });
  }

  const rounds = ['Screening', 'Technical', 'HR', 'Final'];
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    await prisma.masterList.create({
      data: { category: 'ROUND', label: r, value: r, sortOrder: i },
    });
  }

  // 3. System Settings
  const settings = [
    { key: 'FRONT_DESK_ASSIGNMENT_ALLOWED', value: 'false' },
    { key: 'SESSION_TIMEOUT_MINUTES', value: '30' },
    { key: 'FEEDBACK_EDIT_WINDOW_MINUTES', value: '15' },
    { key: 'FRONT_DESK_EDIT_WINDOW_MINUTES', value: '30' },
    { key: 'RETENTION_PERIOD_MONTHS', value: '12' },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
