const express = require('express');
const router = express.Router();
const vendorsController = require('../controllers/vendors.controller');
const vendorsValidation = require('../validators/vendors.validation');
const validate = require('../middlewares/validate.middleware');
const auth = require('../middlewares/auth.middleware');
const optionalAuth = require('../middlewares/optionalAuth.middleware');

router.get('/search', vendorsController.searchVendors);
router.get('/', vendorsController.searchVendors);
router.get('/categories', vendorsController.getAllCategories);
router.get('/cities', vendorsController.getCities);
router.get('/:vendorId', optionalAuth, vendorsController.getVendorById);

router.post('/register', auth, validate(vendorsValidation.registerVendor), vendorsController.registerVendor);
router.get('/profile/me', auth, vendorsController.getMyProfile);
router.patch('/profile/me', auth, vendorsController.updateMyProfile);

router.post('/products', auth, vendorsController.addProduct);
router.get('/products/:productId', optionalAuth, vendorsController.getProductById);
router.patch('/products/:productId', auth, vendorsController.updateProduct);
router.delete('/products/:productId', auth, vendorsController.deleteProduct);

router.post('/reviews', auth, vendorsController.addReview);
router.get('/analytics/me', auth, vendorsController.getVendorAnalytics);

module.exports = router;
