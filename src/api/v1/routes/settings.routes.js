const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const auth = require('../middlewares/auth.middleware');
const permission = require('../middlewares/permission.middleware');

router.get('/', settingsController.getGlobalSettings);
router.patch('/', auth, permission('MANAGE_SETTINGS'), settingsController.updateGlobalSettings);
router.put('/', auth, permission('MANAGE_SETTINGS'), settingsController.updateGlobalSettings);

module.exports = router;
