const prisma = require('./src/config/prisma');

async function main() {
  const admins = await prisma.admin.findMany();
  for (const admin of admins) {
    const perms = admin.permissions || [];
    if (!perms.includes('verify_vendors')) {
      await prisma.admin.update({
        where: { id: admin.id },
        data: {
          permissions: [...perms, 'verify_vendors']
        }
      });
      console.log(`Updated admin ${admin.id} with verify_vendors`);
    }
  }
  console.log("Done");
}

main().catch(console.error).finally(() => prisma.$disconnect());
