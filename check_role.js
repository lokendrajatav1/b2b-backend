const { PrismaClient } = require('./src/generated/client_v3');
const prisma = new PrismaClient();

async function checkUserRole() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'lokendrajatav1503@gmail.com' }
    });
    console.log("USER:", user.email, "ROLE:", user.role, "ACTIVE:", user.isActive);

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserRole();
