const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function check() {
  const email = 'admin@marketplace.com';
  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    console.log(`Diagnostic: User with email ${email} DOES NOT EXIST.`);
    return;
  }

  console.log(`Diagnostic: User found:`);
  console.log(`- ID: ${user.id}`);
  console.log(`- Email: ${user.email}`);
  console.log(`- Role: ${user.role}`);
  console.log(`- Hashed Password in DB: ${user.password}`);
  
  const isMatch = await bcrypt.compare('admin123', user.password);
  console.log(`Diagnostic: BCrypt match for 'admin123': ${isMatch}`);
}

check()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
