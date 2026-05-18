const { PrismaClient } = require('./src/generated/client_v3');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function main() {
  try {
    const vendors = await prisma.vendor.findMany({
      include: {
        user: true
      }
    });

    console.log("Found Vendors in Database:");
    for (const v of vendors) {
      console.log(`- ID: ${v.id} | Name: ${v.companyName} | Email: ${v.user?.email || 'N/A'} | Status: ${v.status}`);
    }

    if (vendors.length > 0) {
      const firstVendor = vendors[0];
      if (firstVendor.user) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('Vendor123', salt);

        await prisma.user.update({
          where: { id: firstVendor.user.id },
          data: { password: hashedPassword }
        });
        console.log(`\nUpdated password for vendor ${firstVendor.user.email} to 'Vendor123'`);
      }
    } else {
      console.log("No vendors found in database.");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
