const axios = require('axios');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'd3ad9c7e1d5f783428285b158cb532736ee22fed8a83e6b4e82dcd66df74194a2c9224e64446dcad72c14755825eb744f75d96d7a400e14aa67a7d5cba694687';
const API_URL = 'http://localhost:5000/api';

async function test() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  // Find a vendor to test
  const vendor = await prisma.vendor.findFirst({ include: { user: true } });
  if (!vendor) return console.log('No vendor found');

  const token = jwt.sign({ id: vendor.userId, role: 'VENDOR' }, JWT_SECRET, { expiresIn: '1h' });

  console.log(`Testing API Update for: ${vendor.businessName}`);

  const payload = {
    products: [
      {
        name: 'API Test Item',
        description: 'Test Description',
        price: '150',
        type: 'PRODUCT',
        moq: '10'
      }
    ]
  };

  try {
    const res = await axios.put(`${API_URL}/vendors/me`, payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('API SUCCESS:', res.data.message);
    
    // Check DB
    const check = await prisma.product.findMany({ where: { vendorId: vendor.id } });
    console.log(`DB Count for ${vendor.id}: ${check.length}`);
    if (check.length > 0) {
        console.log('Sample Product in DB:', check[0].name);
    }
  } catch (error) {
    console.error('API ERROR:', error.response ? error.response.data : error.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
