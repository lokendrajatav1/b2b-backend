const { PrismaClient } = require('../src/generated/client_v3');
const prisma = new PrismaClient();

async function debugRedistribution() {
  const leadId = process.argv[2];
  if (!leadId) {
    console.log("Please provide a Lead ID");
    process.exit(1);
  }

  console.log(`--- DEBUGGING LEAD ${leadId} ---`);
  
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { category: true }
  });

  if (!lead) {
    console.log("Lead not found!");
    process.exit(1);
  }

  console.log(`Lead City: "${lead.city}"`);
  console.log(`Lead Category ID: ${lead.categoryId} (${lead.category?.name})`);
  console.log(`Current Vendor ID: ${lead.vendorId}`);

  const eligibleVendors = await prisma.vendor.findMany({
    where: {
      city: { contains: lead.city.trim(), mode: 'insensitive' },
      categories: { some: { id: lead.categoryId } },
      verified: true,
      user: { isActive: true }
    },
    include: {
      package: true,
      user: true
    }
  });

  console.log(`Total Eligible Vendors found: ${eligibleVendors.length}`);
  eligibleVendors.forEach(v => {
    console.log(`- ${v.businessName} (ID: ${v.id}, Package: ${v.package?.name || 'None'})`);
  });

  const previousAssignments = await prisma.leadLifecycle.findMany({
    where: { leadId, action: { in: ['DISTRIBUTED', 'REDISTRIBUTED'] } }
  });
  
  const previousVendorIds = previousAssignments
    .map(a => {
      const match = a.details?.match(/\(([^)]+)\)/);
      return match ? match[1] : null;
    })
    .filter(Boolean);

  console.log(`Previous Vendor IDs:`, previousVendorIds);

  const availableVendors = eligibleVendors.filter(v => !previousVendorIds.includes(v.id));
  console.log(`Available Vendors (Not previously assigned): ${availableVendors.length}`);
  availableVendors.forEach(v => {
    console.log(`- ${v.businessName} (ID: ${v.id})`);
  });

  await prisma.$disconnect();
}

debugRedistribution();
