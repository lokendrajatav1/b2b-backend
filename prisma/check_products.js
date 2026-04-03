const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const vendors = await prisma.vendor.findMany({
    include: {
      products: true
    }
  });
  console.log('--- Current Data in Database ---');
  vendors.forEach(v => {
    console.log(`Vendor: ${v.businessName} (${v.id})`);
    console.log(`Products (${v.products.length}):`);
    v.products.forEach(p => {
      console.log(` - [${p.type}] ${p.name} | Cat: ${p.category} | Img: ${p.imageUrl ? 'Yes' : 'No'}`);
    });
    console.log('--------------------------------');
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
