const axios = require('axios');

const API_URL = 'http://localhost:5000/api';
// I need a token to test, but I don't have one easily available here.
// Instead, I'll create a script that uses Prisma directly to simulate what the controller does.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const vendor = await prisma.vendor.findFirst();
  if (!vendor) {
    console.log('No vendor found to test with.');
    return;
  }

  console.log(`Testing with vendor: ${vendor.businessName} (${vendor.id})`);

  const mockProducts = [
    {
      name: 'Test Product ' + Date.now(),
      description: 'A test description',
      price: 99.99,
      category: 'Test Category',
      type: 'PRODUCT',
      image: 'https://test.com/image.jpg',
      moq: 5,
      availability: true,
      specifications: 'Test specs'
    }
  ];

  try {
    // Simulate the controller logic
    await prisma.product.deleteMany({ where: { vendorId: vendor.id } });
    console.log('Deleted existing products');

    await prisma.product.createMany({
        data: mockProducts.map(p => ({
            name: p.name,
            description: p.description,
            price: p.price,
            category: p.category,
            type: p.type,
            imageUrl: p.image,
            moq: p.moq,
            availability: p.availability,
            specifications: p.specifications,
            vendorId: vendor.id
        }))
    });
    console.log('Created new products successfully');

    const check = await prisma.product.findMany({ where: { vendorId: vendor.id } });
    console.log('Verification count:', check.length);
    console.log('Sample product:', check[0]);

  } catch (error) {
    console.error('ERROR during test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
