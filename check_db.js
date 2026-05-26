const prisma = require('./src/config/prisma');

async function run() {
  try {
    const vendors = await prisma.vendor.findMany({
      include: { package: true }
    });
    console.log("--- VENDORS AND THEIR PACKAGES ---");
    vendors.forEach(v => {
      console.log(`ID: ${v.id}, Business: ${v.businessName}, Email: ${v.email}, PackageId: ${v.packageId}, PackageName: ${v.package ? v.package.name : 'null'}, Expiry: ${v.planExpiry}`);
    });
    const packages = await prisma.package.findMany();
    console.log("\--- AVAILABLE PACKAGES IN DB ---");
    packages.forEach(p => {
      console.log(`ID: ${p.id}, Name: ${p.name}, Price: ${p.price}`);
    });
  } catch (e) {
    console.error("Error checking db:", e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
