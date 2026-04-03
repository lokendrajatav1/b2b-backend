const express = require('express');
const vendorController = require('../controllers/vendor.controller');
const auth = require('../middleware/auth.middleware');
const optionalAuth = require('../middleware/optionalAuth.middleware');
const restrictTo = require('../middleware/role.middleware');
const { upload } = require('../config/cloudinary');
const validate = require('../middleware/validate.middleware');
const { vendorValidation } = require('../validations/schema');

const router = express.Router();

// Public Routes
router.get('/', validate(vendorValidation.searchVendors), vendorController.searchVendors);
router.get('/categories', vendorController.getAllCategories);

// Protected Routes — Must come BEFORE /:vendorId to avoid route conflicts
router.get('/me', auth, restrictTo('VENDOR'), vendorController.getMyProfile);
router.put('/me', auth, restrictTo('VENDOR'), validate(vendorValidation.updateProfile), vendorController.updateMyProfile);
router.patch('/me/sensitive-info', auth, restrictTo('VENDOR'), vendorController.updateSensitiveInfo);
router.post('/upload-image', auth, restrictTo('VENDOR'), upload.single('image'), vendorController.uploadProductImage);
router.get('/products/:productId', optionalAuth, vendorController.getProductById); // Public: single product detail (with optional auth for status check)
router.post('/products', auth, restrictTo('VENDOR'), validate(vendorValidation.addProduct), vendorController.addProduct); // NEW POST API
router.put('/products/:productId', auth, restrictTo('VENDOR'), validate(vendorValidation.updateProduct), vendorController.updateProduct);
router.delete('/products/:productId', auth, restrictTo('VENDOR'), vendorController.deleteProduct);
router.get('/packages', auth, vendorController.getPackages);
router.get('/analytics', auth, restrictTo('VENDOR'), vendorController.getVendorAnalytics);

// Registration (available to any authenticated user)
router.post('/register-vendor', auth, validate(vendorValidation.registerVendor), vendorController.registerVendor);

// Buyer interactions (authenticated users)
router.post('/feedback', auth, validate(vendorValidation.addFeedback), vendorController.addFeedback);

// Business Showcase (Vendor only)
router.post('/gallery', auth, restrictTo('VENDOR'), upload.array('images', 5), vendorController.addGalleryImages);
router.delete('/gallery/:imageId', auth, restrictTo('VENDOR'), vendorController.removeGalleryImage);
router.post('/certifications', auth, restrictTo('VENDOR'), upload.single('certification'), vendorController.addCertification);

// Public: View single vendor (with optional auth for tiered access) — MUST be LAST
router.get('/:vendorId', optionalAuth, vendorController.getVendorById);

module.exports = router;
