const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const auth = require('../middlewares/auth.middleware');
const permission = require('../middlewares/permission.middleware');

router.use(auth);

// Vendor Approvals
router.patch('/vendors/:vendorId/approve', permission('APPROVE_VENDOR'), adminController.approveVendor);
router.patch('/vendors/:vendorId/unverify', permission('APPROVE_VENDOR'), adminController.unverifyVendor);
router.delete('/vendors/:vendorId/reject', permission('APPROVE_VENDOR'), adminController.rejectVendor);

// Flat Aliases for Vendor Approvals (matches frontend)
router.patch('/approve-vendor/:vendorId', permission('APPROVE_VENDOR'), adminController.approveVendor);
router.patch('/unverify-vendor/:vendorId', permission('APPROVE_VENDOR'), adminController.unverifyVendor);
router.delete('/reject-vendor/:vendorId', permission('APPROVE_VENDOR'), adminController.rejectVendor);

router.get('/vendors/pending', permission('VIEW_VENDORS'), adminController.getPendingVendors);
router.get('/vendors/:vendorId/secure', permission('VIEW_VENDORS'), adminController.getVendorSecureDetails);

// User Management
router.get('/users', permission('VIEW_USERS'), adminController.getAllUsers);
router.patch('/users/:userId', permission('MANAGE_USERS'), adminController.updateUserStatus);
router.delete('/users/:userId', permission('MANAGE_USERS'), adminController.deleteUser);

// Lead Management
router.get('/leads', permission('VIEW_LEADS'), adminController.getAllLeads);
router.patch('/leads/:leadId/reassign', permission('MANAGE_LEADS'), adminController.reassignLead);
router.patch('/vendors/:vendorId/boost', permission('MANAGE_LEADS'), adminController.manualBoostVendor);

// Category Management
router.get('/categories', adminController.adminGetAllCategories);
router.post('/categories', permission('MANAGE_SETTINGS'), adminController.createCategory);
router.delete('/categories/:id', permission('MANAGE_SETTINGS'), adminController.deleteCategory);

// Package Management
router.get('/packages', adminController.getAllPackages);
router.post('/packages', permission('MANAGE_SETTINGS'), adminController.createPackage);
router.patch('/packages/:packageId', permission('MANAGE_SETTINGS'), adminController.updatePackage);
router.put('/packages/:packageId', permission('MANAGE_SETTINGS'), adminController.updatePackage); // Added PUT alias
router.delete('/packages/:packageId', permission('MANAGE_SETTINGS'), adminController.deletePackage);

// Transactions
router.get('/transactions', permission('VIEW_TRANSACTIONS'), adminController.getAllTransactions);

// Analytics
router.get('/analytics', permission('VIEW_ANALYTICS'), adminController.getAnalytics);
router.get('/analytics/keywords', permission('VIEW_ANALYTICS'), adminController.getKeywordAnalytics);
router.get('/analytics/performance', permission('VIEW_ANALYTICS'), adminController.getPerformanceAnalytics);
router.get('/stats', adminController.getDashboardStats);
router.get('/approvals', adminController.getVendorApprovals);
router.get('/offerings', adminController.getPendingOfferings); // Added alias for frontend
router.get('/offerings/pending', adminController.getPendingOfferings);
router.patch('/offerings/:offeringId/approve', adminController.approveOffering);
router.patch('/offerings/:offeringId/reject', adminController.rejectOffering);
router.patch('/offerings/:offeringId', adminController.editOffering);
router.get('/activity', adminController.getActivityLogs);
router.get('/activity-logs', adminController.getActivityLogs);
router.get('/settings', adminController.getSettings);
router.patch('/settings', adminController.updateSettings);

module.exports = router;
