const { PrismaClient } = require('./src/generated/client_v3');
const p = new PrismaClient();
async function main() {
  const admins = await p.admin.findMany();
  for (const admin of admins) {
    if (admin.name && admin.name.toLowerCase().includes('sub-admin')) {
      const newName = admin.name.replace(/sub-admin/gi, 'admin');
      await p.admin.update({
        where: { id: admin.id },
        data: { name: newName }
      });
      console.log(`Updated ${admin.name} to ${newName}`);
    }
  }
}
main().finally(() => p.$disconnect());
