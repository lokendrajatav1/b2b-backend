const { PrismaClient } = require('./src/generated/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const user = await prisma.user.findUnique({
        where: { email: 'nonexistent@example.com' }
    });
    console.log('User found (or null):', user);
    console.log('SUCCESS: Table exists!');
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
