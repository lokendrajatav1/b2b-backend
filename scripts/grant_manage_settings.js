const { PrismaClient } = require('../src/generated/client_v3');
const prisma = new PrismaClient();

// Replace with the userId of the admin you want to grant the permission to
const USER_ID = 'REPLACE_WITH_ADMIN_USER_ID'; // e.g., "123e4567-e89b-12d3-a456-426614174000"

async function grantPermission() {
  try {
    const admin = await prisma.admin.findUnique({
      where: { userId: USER_ID },
    });
    if (!admin) {
      console.error('Admin not found for userId:', USER_ID);
      return;
    }

    const existing = admin.permissions || [];
    if (existing.includes('MANAGE_SETTINGS')) {
      console.log('Admin already has MANAGE_SETTINGS permission');
      return;
    }

    await prisma.admin.update({
      where: { userId: USER_ID },
      data: {
        permissions: {
          push: 'MANAGE_SETTINGS',
        },
      },
    });
    console.log('MANAGE_SETTINGS permission granted to admin with userId:', USER_ID);
  } catch (err) {
    console.error('Error granting permission:', err);
  } finally {
    await prisma.$disconnect();
  }
}

grantPermission();
