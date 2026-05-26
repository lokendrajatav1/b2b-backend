const prisma = require('../src/config/prisma');

async function main() {
  try {
    const products = await prisma.product.findMany({
      include: {
        vendor: true
      }
    });
    console.log('--- ALL PRODUCTS IN DATABASE ---');
    products.forEach(p => {
      console.log(`ID: ${p.id} | Name: ${p.name} | Vendor: ${p.vendor.businessName} (${p.vendor.id}) | Category: ${p.category} | Status: ${p.status}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
