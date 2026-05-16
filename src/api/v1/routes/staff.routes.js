const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staff.controller');
const auth = require('../middlewares/auth.middleware');
const permission = require('../middlewares/permission.middleware');

router.use(auth);
router.use(permission('MANAGE_STAFF'));

router.post('/', staffController.createAdmin);
router.get('/', staffController.getAllAdmins);
router.patch('/:id', staffController.updateAdmin);
router.delete('/:id', staffController.deleteAdmin);

module.exports = router;
