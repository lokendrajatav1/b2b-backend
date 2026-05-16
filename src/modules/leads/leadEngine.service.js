// This service is now consolidated into leads.service.js
// Kept for backward compatibility — re-exports from leads.service.js
const { distributeInquiryLead } = require('./leads.service');
module.exports = { distributeLead: distributeInquiryLead };
