const { PrismaClient } = require('../src/generated/client');
const prisma = new PrismaClient();

async function main() {
  const categories = [
    "Machine Parts",
    "Industrial Machines",
    "Industrial Supplies",
    "Construction",
    "Hospitals & Labs",
    "Drugs & Pharma",
    "Electronics",
    "Packing Machines",
    "Chemicals",
    "Metals",
    "Beauty & Care",
    "Engineering Services",
    "IT & Computers",
    "Jewelry & Gems",
    "Home Supplies",
    "Herbal Products",
    "Sports & Toys",
    "Transport & Logistics",
    "Business Services",
    "Travel & Hotels",
    "Education & Training",
    "Architects & Interiors",
    "HR & Recruitment",
    "Rail & Shipping",
    "Housekeeping",
    "Electronics Parts",
    "Electrical Goods"
  ];

  console.log(`🚀 Seeding ${categories.length} Ecosystem Segments...`);

  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { 
        name,
        description: `Marketplace nodes for ${name}.`,
        icon: 'LayoutGrid'
      }
    });
  }

  console.log('✅ Sector Nodes Initialized Successfully');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
