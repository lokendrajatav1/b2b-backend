const { PrismaClient } = require('./src/generated/client_v3');
const prisma = new PrismaClient();

async function checkUserVendor() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'patidardheeraj1944@gmail.com' },
      include: { vendor: { include: { categories: true, products: true } } }
    });
    console.log("USER:", user.email, "ID:", user.id);
    console.log("VENDOR PRODUCTS:", JSON.stringify(user.vendor?.products, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserVendor();
