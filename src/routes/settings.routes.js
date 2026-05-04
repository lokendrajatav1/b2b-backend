const express = require('express');
const router = express.Router();
const { getGlobalSettings, updateGlobalSettings } = require('../controllers/settings.controller');
const auth = require('../middleware/auth.middleware');
const restrictTo = require('../middleware/role.middleware');

router.get('/', getGlobalSettings);
router.put('/', auth, restrictTo('SUPERADMIN', 'ADMIN'), updateGlobalSettings);

module.exports = router;
