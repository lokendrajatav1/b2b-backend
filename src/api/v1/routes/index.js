const express = require("express");
const router = express.Router();

const authRoutes = require("./auth.routes");
const leadsRoutes = require("./leads.routes");
const vendorsRoutes = require("./vendors.routes");
const packageRoutes = require("./package.routes");
const paymentsRoutes = require("./payments.routes");
const notificationsRoutes = require("./notifications.routes");
const settingsRoutes = require("./settings.routes");
const staffRoutes = require("./staff.routes");
const adminRoutes = require("./admin.routes");
const categoryRoutes = require("./category.routes");
const refundsRoutes = require("./refunds.routes");

router.use("/auth", authRoutes);
router.use("/leads", leadsRoutes);
router.use("/vendors", vendorsRoutes);
router.use("/packages", packageRoutes);
router.use("/payments", paymentsRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/settings", settingsRoutes);
router.use('/admins', staffRoutes);
router.use("/admin", adminRoutes);
router.use("/categories", categoryRoutes);
router.use("/refunds", refundsRoutes);

module.exports = router;
