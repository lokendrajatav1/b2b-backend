const { PrismaClient } = require('../src/generated/client_v3');
const prisma = new PrismaClient();

async function checkUser() {
  const users = await prisma.user.findMany({
    select: { email: true, avatar: true, role: true }
  });
  console.log(JSON.stringify(users, null, 2));
  await prisma.$disconnect();
}

checkUser();
