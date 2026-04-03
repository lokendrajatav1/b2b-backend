const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('vendor123', 10);
  
  // 1. Get or Create Category
  let category = await prisma.category.findUnique({ where: { name: 'IT Services' } });
  if (!category) {
    category = await prisma.category.create({ data: { name: 'IT Services' } });
  }

  // 2. Get or Create Package
  let pkg = await prisma.package.findFirst({ where: { name: 'Diamond' } });
  if (!pkg) {
    pkg = await prisma.package.create({
      data: {
        name: 'Diamond',
        price: 15000,
        description: 'Priority distribution and SEO boost.'
      }
    });
  }

  // 3. Create Vendor User
  const user = await prisma.user.upsert({
    where: { email: 'vendor@marketplace.com' },
    update: { role: 'VENDOR' },
    create: {
      email: 'vendor@marketplace.com',
      password: hashedPassword,
      name: 'Global Tech Solutions',
      role: 'VENDOR'
    }
  });

  // 4. Create Vendor Profile
  const vendorData = {
    userId: user.id,
    businessName: 'Global Tech Solutions',
    email: 'vendor@marketplace.com', // Added missing email
    description: 'Premier IT and Software solutions provider.',
    city: 'Mumbai',
    address: 'Bandra-Kurla Complex, Mumbai',
    phone: '+91 98765 43210',
    verified: true,
    categoryId: category.id,
    packageId: pkg.id,
    totalScore: 94.2,
    responseTime: 1.2
  };

  const vendor = await prisma.vendor.upsert({
    where: { userId: user.id },
    update: vendorData,
    create: vendorData
  });

  // 5. Create Sample Leads for this vendor
  const sampleLeads = [
    { buyerName: 'Vijay Kumar', phone: '90000 11111', city: 'Mumbai', status: 'DISTRIBUTED' },
    { buyerName: 'Anjali Shah', phone: '90000 22222', city: 'Pune', status: 'CLOSED' },
    { buyerName: 'Rahul Mehta', phone: '90000 33333', city: 'Mumbai', status: 'DISTRIBUTED' },
    { buyerName: 'Sumit Rao', phone: '90000 44444', city: 'Nagpur', status: 'PENDING' }
  ];

  // Clean old leads for this vendor if re-seeding
  await prisma.lead.deleteMany({ where: { vendorId: vendor.id } });

  for (const l of sampleLeads) {
    await prisma.lead.create({
      data: {
        ...l,
        categoryId: category.id,
        vendorId: vendor.id,
        type: 'INQUIRY'
      }
    });
  }

  console.log('💎 Premium Vendor Seeded Successfully');
  console.log('Email: vendor@marketplace.com');
  console.log('Password: vendor123');
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
