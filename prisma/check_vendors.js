const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const vendors = await prisma.user.findMany({
    where: { role: 'VENDOR' },
    select: { email: true, name: true }
  });
  console.log('Registered Vendors:', vendors);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
