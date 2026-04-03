// This service is now consolidated into lead.service.js
// Kept for backward compatibility — re-exports from lead.service.js
const { recalculateRankings } = require('./lead.service');
module.exports = { calculateScore: recalculateRankings };