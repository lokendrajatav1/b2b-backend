require('dotenv').config();
const { PrismaClient } = require('./src/generated/client_v2');
const prisma = new PrismaClient();

async function main() {
  try {
    try {
      await prisma.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE 'SUPERADMIN'`);
      console.log("Added SUPERADMIN to Role enum");
    } catch (e) {
      console.log("SUPERADMIN might already exist:", e.message);
    }

    // 1. Rename existing ADMIN to SUPERADMIN
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "role" = 'SUPERADMIN' WHERE "role" = 'ADMIN'`);
    console.log("Updated ADMIN to SUPERADMIN");

    // 2. Rename SUBADMIN to ADMIN
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "role" = 'ADMIN' WHERE "role" = 'SUBADMIN'`);
    console.log("Updated SUBADMIN to ADMIN");

    console.log("Roles updated successfully.");
  } catch (error) {
    console.error("Error updating roles:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
