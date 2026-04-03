const express = require('express');
const router = express.Router();
const subAdminController = require('../controllers/subadmin.controller');
const auth = require('../middleware/auth.middleware');
const restrictTo = require('../middleware/role.middleware');

router.use(auth);
router.use(restrictTo('ADMIN'));

// All routes here are strictly for main admins
router.post('/', subAdminController.createSubAdmin);
router.get('/', subAdminController.getAllSubAdmins);
router.patch('/:id', subAdminController.updateSubAdmin);
router.delete('/:id', subAdminController.deleteSubAdmin);

module.exports = router;
