const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const email = 'admin@marketplace.com';
  const existing = await prisma.user.findUnique({ where: { email } });
  
  if (existing) {
    console.log('Admin already exists');
    return;
  }

  const hashed = await bcrypt.hash('admin123', 10);
  await prisma.user.create({
    data: {
      name: 'Super Admin',
      email,
      password: hashed,
      role: 'ADMIN'
    }
  });

  console.log('Admin user created successfully: admin@marketplace.com / admin123');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
