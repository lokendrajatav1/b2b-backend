const { PrismaClient } = require('./src/generated/client_v3');
const prisma = new PrismaClient();

async function checkLeads() {
  try {
    const leads = await prisma.lead.findMany({
      where: { vendorId: { not: null } },
      include: { vendor: true }
    });
    console.log("LEADS WITH VENDOR ASSIGNMENT:", leads.length);
    leads.forEach(l => {
      console.log(`Lead ${l.id}: Status=${l.status}, VendorID=${l.vendorId}, VendorName=${l.vendor?.businessName}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkLeads();
