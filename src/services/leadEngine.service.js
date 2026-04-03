// This service is now consolidated into lead.service.js
// Kept for backward compatibility — re-exports from lead.service.js
const { distributeInquiryLead } = require('./lead.service');
module.exports = { distributeLead: distributeInquiryLead };