// Ranking service — recalculates vendor scores
const prisma = require('../../config/prisma');

const recalculateRankings = async () => {
  const vendors = await prisma.vendor.findMany({
    include: { leads: true, feedback: true, subscription: true }
  });

  for (const vendor of vendors) {
    const leadScore   = Math.min(vendor.leads.length * 2, 40);
    const reviewScore = vendor.feedback.reduce((s, f) => s + f.rating, 0) / (vendor.feedback.length || 1) * 8;
    const subScore    = vendor.subscription?.status === 'ACTIVE' ? 20 : 0;
    const verifyScore = vendor.isVerified ? 20 : 0;
    const totalScore  = Math.round(leadScore + reviewScore + subScore + verifyScore);

    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { rankScore: totalScore }
    });
  }

  console.log(`[RANKING] Recalculated scores for ${vendors.length} vendors`);
};

module.exports = { recalculateRankings };
