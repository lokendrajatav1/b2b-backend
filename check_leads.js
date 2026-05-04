const { PrismaClient } = require('./src/generated/client_v3');
const prisma = new PrismaClient();

async function checkLeads() {
  try {
    const leads = await prisma.lead.findMany({
      include: { vendor: true }
    });
    console.log("TOTAL LEADS:", leads.length);
    leads.forEach(l => {
      console.log(`Lead ${l.id}: Status=${l.status}, VendorID=${l.vendorId}, VendorName=${l.vendor?.businessName}`);
    });

    const vendors = await prisma.vendor.findMany({
      include: { user: true }
    });
    console.log("\nVENDORS:");
    vendors.forEach(v => {
      console.log(`Vendor ${v.id}: Business=${v.businessName}, UserEmail=${v.user.email}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkLeads();
