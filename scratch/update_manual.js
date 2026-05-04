const { PrismaClient } = require('../src/generated/client_v3');
const prisma = new PrismaClient();

async function updateManual() {
  const user = await prisma.user.findFirst({
    where: { email: 'acore.renuka@gmail.com' }
  });
  
  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { avatar: 'https://res.cloudinary.com/dnxmt3eji/image/upload/v1775306638/uploads/zypslthptk4hycc5zhji.png' }
    });
    console.log("Updated avatar manually for acore.renuka@gmail.com");
  } else {
    console.log("User not found");
  }
  await prisma.$disconnect();
}

updateManual();
