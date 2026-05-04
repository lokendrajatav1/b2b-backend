const express = require('express');
const leadController = require('../controllers/lead.controller');
const auth = require('../middleware/auth.middleware');
const restrictTo = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const { leadValidation } = require('../validations/schema');

const router = express.Router();

// Public: Lead Entry Points
router.post('/', validate(leadValidation.createLead), leadController.createLead);
router.post('/idle', validate(leadValidation.createLead), leadController.createIdleLead);
router.post('/direct', validate(leadValidation.createDirectLead), leadController.createDirectLead);
router.post('/match-with-you', validate(leadValidation.createLead), leadController.matchWithYou);

// Protected: Vendor views their own leads
router.get('/my-leads', auth, restrictTo('VENDOR'), leadController.getVendorLeads);

// Protected: Admin views specific vendor leads
router.get('/vendor-leads/:vendorId', auth, restrictTo('SUPERADMIN'), leadController.getVendorLeads);
router.patch('/:leadId/status', auth, restrictTo('VENDOR'), validate(leadValidation.updateLeadStatus), leadController.updateLeadStatus);

module.exports = router;
