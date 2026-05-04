const express = require('express');
const adminController = require('../controllers/admin.controller');
const auth = require('../middleware/auth.middleware');
const restrictTo = require('../middleware/role.middleware');
const checkPermission = require('../middleware/permission.middleware');

const router = express.Router();

// Protect all admin routes
router.use(auth);
router.use(restrictTo('SUPERADMIN', 'ADMIN'));

// Vendor Approvals & Data
router.patch('/approve-vendor/:vendorId', checkPermission('verify_vendors'), adminController.approveVendor);
router.patch('/unverify-vendor/:vendorId', checkPermission('verify_vendors'), adminController.unverifyVendor);
router.delete('/reject-vendor/:vendorId', checkPermission('verify_vendors'), adminController.rejectVendor);
router.get('/vendors/pending', checkPermission('verify_vendors'), adminController.getPendingVendors);
router.get('/vendors/:vendorId/secure-details', checkPermission('verify_vendors'), adminController.getVendorSecureDetails);

// User & Vendor Management
router.get('/users', checkPermission('manage_users'), adminController.getAllUsers);
router.patch('/users/:userId', checkPermission('manage_users'), adminController.updateUserStatus);
router.delete('/users/:userId', checkPermission('manage_users'), adminController.deleteUser);
router.patch('/vendors/:vendorId/suspend', checkPermission('verify_vendors'), adminController.suspendVendor);

// Lead & Ranking Controls
router.patch('/leads/:leadId/reassign', checkPermission('manage_leads'), adminController.reassignLead);
router.patch('/vendors/:vendorId/boost', checkPermission('verify_vendors'), adminController.manualBoostVendor);

// Offering Approvals (Products/Services)
router.get('/offerings', checkPermission('verify_products'), adminController.getPendingOfferings);
router.put('/offerings/:offeringId', checkPermission('verify_products'), adminController.editOffering);
router.patch('/offerings/:offeringId/approve', checkPermission('verify_products'), adminController.approveOffering);
router.patch('/offerings/:offeringId/reject', checkPermission('verify_products'), adminController.rejectOffering);


// Package Management (RESTRICTED TO MAIN SUPERADMIN)
router.get('/packages', restrictTo('SUPERADMIN', 'ADMIN'), adminController.getAllPackages);
router.post('/packages', restrictTo('SUPERADMIN', 'ADMIN'), adminController.createPackage);
router.put('/packages/:packageId', restrictTo('SUPERADMIN', 'ADMIN'), adminController.updatePackage);
router.delete('/packages/:packageId', restrictTo('SUPERADMIN', 'ADMIN'), adminController.deletePackage);

// Transactions & Notifications
router.get('/transactions', restrictTo('SUPERADMIN', 'ADMIN'), adminController.getAllTransactions);
router.post('/notifications/broadcast', checkPermission('manage_notifications'), adminController.broadcastNotification);

// Analytics & Settings
router.get('/analytics', restrictTo('SUPERADMIN', 'ADMIN'), adminController.getAnalytics);
router.get('/analytics/locations', restrictTo('SUPERADMIN', 'ADMIN'), adminController.getLocationAnalytics);
router.get('/analytics/keywords', restrictTo('SUPERADMIN', 'ADMIN'), adminController.getKeywordAnalytics);
router.get('/analytics/performance', restrictTo('SUPERADMIN', 'ADMIN'), adminController.getPerformanceAnalytics);
router.get('/google-merchant-feed', restrictTo('SUPERADMIN', 'ADMIN'), adminController.getGoogleMerchantFeed);
router.get('/leads', checkPermission('manage_leads'), adminController.getAllLeads);
router.get('/settings', restrictTo('SUPERADMIN', 'ADMIN'), adminController.getSettings);
router.patch('/settings', restrictTo('SUPERADMIN', 'ADMIN'), adminController.updateSettings);
router.post('/categories', checkPermission('manage_categories'), adminController.createCategory);
router.get('/categories', checkPermission('manage_categories'), adminController.adminGetAllCategories);
router.delete('/categories/:id', checkPermission('manage_categories'), adminController.deleteCategory);

router.get('/activity', restrictTo('SUPERADMIN', 'ADMIN'), adminController.getActivityLogs);

module.exports = router;
