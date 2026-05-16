const express = require('express');
const router = express.Router();
const leadsController = require('../controllers/leads.controller');
const leadsValidation = require('../validators/leads.validation');
const validate = require('../middlewares/validate.middleware');
const auth = require('../middlewares/auth.middleware');
const permission = require('../middlewares/permission.middleware');

router.post('/create', validate(leadsValidation.createLead), leadsController.createLead);
router.post('/idle', validate(leadsValidation.createLead), leadsController.createIdleLead);
router.post('/direct', leadsController.createDirectLead);
router.post('/match', leadsController.matchWithYou);

router.get('/vendor', auth, leadsController.getVendorLeads);
router.patch('/:leadId/status', auth, leadsController.updateLeadStatus);

module.exports = router;
