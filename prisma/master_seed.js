const { PrismaClient } = require('../src/generated/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Initializing Global Ecosystem Seed (v2)...');

  const hashedPassword = await bcrypt.hash('admin123', 10);
  const vendorPassword = await bcrypt.hash('vendor123', 10);

  // 1. Seed Packages
  console.log('📦 Syncing Packages...');
  const packagesData = [
    { name: 'Diamond', price: 15000, monthlyLeads: 100, priority: 10, description: 'Elite tier with maximum visibility.' },
    { name: 'Platinum', price: 9000, monthlyLeads: 50, priority: 7, description: 'Premium tier for established businesses.' },
    { name: 'Gold', price: 4500, monthlyLeads: 20, priority: 4, description: 'Standard growth tier.' },
  ];

  const packages = [];
  for (const pkg of packagesData) {
    const p = await prisma.package.upsert({
      where: { name: pkg.name },
      update: pkg,
      create: pkg
    });
    packages.push(p);
  }

  // 2. Seed Categories with Specific Industrial Data
  console.log('📂 Syncing 27+ Specialized Industry Categories...');
  const industryMap = {
    'Machine Parts': { p: 'High-Precision Gears', s: 'Custom Machining Service' },
    'Industrial Machines': { p: 'Vertical CNC Center', s: 'Machine Calibration Service' },
    'Industrial Supplies': { p: 'Heavy Duty Sealants', s: 'Bulk Supply Logistics' },
    'Construction': { p: 'Self-Compacting Concrete', s: 'Structural Engineering Audit' },
    'Hospitals & Labs': { p: 'Centrifuge Unit R-8', s: 'Biomedical Equipment Repair' },
    'Drugs & Pharma': { p: 'Amoxicillin API Bulk', s: 'GMP Compliance Consulting' },
    'Electronics': { p: 'SMD Capacitor Array', s: 'Circuit Design Support' },
    'Packing Machines': { p: 'Automatic Flow Wrapper', s: 'Packaging Line Optimization' },
    'Chemicals': { p: 'Industrial Grade Ethanol', s: 'Chemical Safety Training' },
    'Metals': { p: 'Anodized Aluminum Sheets', s: 'Surface Treatment Service' },
    'Beauty & Care': { p: 'Organic Essential Oils', s: 'Brand Launch Consulting' },
    'Engineering Services': { p: 'CAD Workstations', s: 'Structural Integrity Testing' },
    'IT & Computers': { p: 'Enterprise Firewall Box', s: 'Network Architecture Service' },
    'Jewelry & Gems': { p: 'Standardized Diamond Cut', s: 'Gemological Certification' },
    'Home Supplies': { p: 'Smart Lighting System', s: 'Interior Installation Support' },
    'Herbal Products': { p: 'SFE Derived Extracts', s: 'Ayurvedic Formulation Support' },
    'Sports & Toys': { p: 'Durable Synthetic Turf', s: 'Safety Compliance Audit' },
    'Transport & Logistics': { p: 'GPS Tracking Modules', s: 'Freight Optimization Service' },
    'Business Services': { p: 'Professional Office Kits', s: 'Strategic Business Planning' },
    'Travel & Hotels': { p: 'Enterprise Booking API', s: 'Hospitality Staff Training' },
    'Education & Training': { p: 'Standard Training Modules', s: 'Curriculum Development' },
    'Architects & Interiors': { p: 'Standardized Wall Panels', s: 'Acoustic Design Service' },
    'HR & Recruitment': { p: 'HR Management Suite', s: 'Executive Search Service' },
    'Rail & Shipping': { p: 'Heavy Container Locks', s: 'Harbor Logistics Support' },
    'Housekeeping': { p: 'Industrial Vacuum Unit', s: 'Deep Cleaning Protocol Training' },
    'Electronics Parts': { p: 'Micro-Controller Unit', s: 'Component Sourcing Service' },
    'Electrical Goods': { p: 'Variable Speed Drive', s: 'Energy Efficiency Audit' }
  };

  const categories = [];
  for (const [catName, data] of Object.entries(industryMap)) {
    const c = await prisma.category.upsert({
      where: { name: catName },
      update: {},
      create: { 
        name: catName, 
        description: `Professional solutions for the ${catName} sector.`,
        icon: 'Factory' 
      }
    });
    categories.push({ ...c, ...data });
  }

  // 3. Seed Admin
  console.log('🔑 Syncing Admin Gateway...');
  await prisma.user.upsert({
      where: { email: 'admin@marketplace.com' },
      update: { role: 'ADMIN' },
      create: {
        email: 'admin@marketplace.com',
        password: hashedPassword,
        name: 'Super Admin',
        role: 'ADMIN'
      }
  });

  // 4. Seed High-Fidelity Vendor Hub
  console.log('🏢 Syncing Industry-Specific Vendor Grid (270 nodes)...');
  const cities = ['Delhi', 'Mumbai', 'Bangalore', 'Ahmedabad', 'Surat', 'Kolkata', 'Pune', 'Chennai', 'Hyderabad', 'Jaipur'];

  let count = 0;
  for (const category of categories) {
    for (const city of cities) {
      const slug = category.name.toLowerCase().replace(/ & /g, '_').replace(/ /g, '_');
      const email = `${slug}_${city.toLowerCase()}@industrial.com`;
      
      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          password: vendorPassword,
          name: `${category.p} Specialist ${city}`,
          phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
          role: 'VENDOR'
        }
      });

      const vendor = await prisma.vendor.upsert({
        where: { userId: user.id },
        update: {
          businessName: `${city} ${category.name} Hub`,
          verified: true,
          city,
          categories: { connect: [{ id: category.id }] }
        },
        create: {
          userId: user.id,
          businessName: `${city} ${category.name} Hub`,
          email,
          phone: user.phone,
          city,
          verified: true,
          packageId: packages[Math.floor(Math.random() * packages.length)].id,
          categories: { connect: [{ id: category.id }] },
          totalScore: 90 + Math.random() * 10
        }
      });

      // Specific Category Product
      await prisma.product.create({
        data: {
          vendorId: vendor.id,
          name: category.p,
          description: `Industrial high-grade ${category.p} manufactured specifically for enterprise applications in the ${city} cluster.`,
          price: 5000 + Math.floor(Math.random() * 50000),
          category: 'Hardware',
          type: 'PRODUCT',
          status: 'APPROVED'
        }
      });

      // Specific Category Service
      await prisma.product.create({
        data: {
          vendorId: vendor.id,
          name: category.s,
          description: `Professional ${category.s} covering installation, maintenance, and strategic support for ${category.name} clients in ${city}.`,
          price: 2000 + Math.floor(Math.random() * 8000),
          category: 'Consulting',
          type: 'SERVICE',
          status: 'APPROVED'
        }
      });

      count++;
    }
  }

  console.log(`\n✨ Global Ecosystem Re-Seeded! Created ${count} tailored industry nodes.`);
  console.log('---------------------------');
  console.log('GATEWAY: admin@marketplace.com / admin123');
  console.log('VENDOR PASS: vendor123');
  console.log('---------------------------');
}

main()
  .catch(e => {
    console.error('❌ SEED ERROR:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
