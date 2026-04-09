const { PrismaClient } = require('../src/generated/client_v2');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting image migration...');
  
  const products = await prisma.product.findMany({
    where: {
      imageUrl: { not: null }
    }
  });

  console.log(`Found ${products.length} products to update.`);

  for (const product of products) {
    if (product.imageUrl && (!product.images || product.images.length === 0)) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          images: { set: [product.imageUrl] }
        }
      });
      console.log(`Updated product ${product.id}`);
    }
  }

  console.log('Migration complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
