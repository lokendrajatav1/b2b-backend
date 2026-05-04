const { PrismaClient } = require('./src/generated/client_v3');
const prisma = new PrismaClient();

async function checkVendorUser() {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: '2f07fa28-1835-4f59-a172-54f5f78e5ba5' },
      include: { user: true }
    });
    console.log("VENDOR:", vendor.businessName);
    console.log("USER:", vendor.user.email, "ROLE:", vendor.user.role);

    const leads = await prisma.lead.findMany({
      where: { vendorId: vendor.id }
    });
    console.log("LEADS IN DB:", leads.length);

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkVendorUser();
