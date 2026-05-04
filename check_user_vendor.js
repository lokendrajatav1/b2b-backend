const { PrismaClient } = require('./src/generated/client_v3');
const prisma = new PrismaClient();

async function checkUserVendor() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'lokendrajatav1503@gmail.com' },
      include: { vendor: true }
    });
    console.log("USER:", user.email, "ID:", user.id);
    console.log("VENDOR:", user.vendor?.businessName, "VENDOR_ID:", user.vendor?.id, "LINKED_USER_ID:", user.vendor?.userId);

    const leads = await prisma.lead.findMany({
      where: { vendorId: user.vendor?.id }
    });
    console.log("LEADS COUNT FOR THIS VENDOR:", leads.length);

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserVendor();
