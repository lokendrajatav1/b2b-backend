const express = require('express');
const router = express.Router();
const vendorsController = require('../controllers/vendors.controller');

router.get('/', vendorsController.getPackages);

module.exports = router;
