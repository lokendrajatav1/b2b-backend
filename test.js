const { PrismaClient } = require('./src/generated/client_v3');
const p = new PrismaClient();
p.admin.findMany().then(a => {
  console.log('Admins:', a);
  return p.user.findMany({ where: { role: 'ADMIN' }});
}).then(u => {
  console.log('Users:', u);
}).finally(() => p.$disconnect());
