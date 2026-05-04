const express = require('express');
const router = express.Router();
const adminController = require('../controllers/staff.controller');
const auth = require('../middleware/auth.middleware');
const restrictTo = require('../middleware/role.middleware');

router.use(auth);
router.use(restrictTo('SUPERADMIN', 'ADMIN'));

// All routes here are strictly for main admins
router.post('/', adminController.createAdmin);
router.get('/', adminController.getAllAdmins);
router.patch('/:id', adminController.updateAdmin);
router.delete('/:id', adminController.deleteAdmin);

module.exports = router;
